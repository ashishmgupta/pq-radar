"""The verdict-bearing scan core, shared by two entry points: the HTTP server
(server.py, invoked by the Cloudflare Worker's container binding) and the
standalone CLI (scan.py). This logic lives here once — whether a handshake
counts as pq / classical / downgrade / intolerant / indeterminate / unreachable
must never diverge between the hosted and offline paths."""
import asyncio
import ipaddress
import re

PRIMARY_GROUPS = "X25519MLKEM768:X25519:P-256"
FALLBACK_GROUPS = "X25519:P-256"


def expand_targets(subnets):
    """Builds (target, sni_hint) pairs. A target is an IP expanded from a CIDR
    (direct_to_origin scans), a literal hostname (client_to_edge scans), or a literal
    single IP (direct_to_origin origins outside the configured CIDRs) — openssl and
    asyncio.open_connection accept any of these directly, so no separate DNS
    resolution step is needed for the hostname case, and no CIDR expansion for the
    literal-IP case."""
    pairs = []
    for s in subnets:
        sni_hint = s.get("sni_hint")
        if "hostname" in s:
            pairs.append((s["hostname"], sni_hint or s["hostname"]))
        elif "ip" in s:
            pairs.append((s["ip"], sni_hint))
        else:
            network = ipaddress.ip_network(s["cidr"], strict=False)
            pairs.extend((str(ip), sni_hint) for ip in network.hosts())

    # De-dupe by target: a literal IP (e.g. a DNS record's origin) can also fall inside a
    # configured CIDR, which would otherwise probe it twice in one run and insert two
    # `results` rows sharing the same (ip, leg, ts) — that fans out downstream joins in the
    # readiness query into duplicate-looking rows. First occurrence's sni_hint wins.
    seen = {}
    for target, sni_hint in pairs:
        if target not in seen:
            seen[target] = sni_hint
    return list(seen.items())


async def check_live(ip, port, timeout_s, sem):
    async with sem:
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port), timeout=timeout_s
            )
            writer.close()
            return ip, True
        except Exception:
            return ip, False


def parse_probe_output(output):
    read_match = re.search(r"SSL handshake has read (\d+) bytes", output)
    bytes_read = int(read_match.group(1)) if read_match else 0
    protocol_match = re.search(r"^Protocol\s*:\s*(\S+)", output, re.MULTILINE)
    protocol = protocol_match.group(1) if protocol_match else None
    group_match = re.search(r"Negotiated TLS1\.3 group:\s*(\S+)", output)
    group = group_match.group(1) if group_match and group_match.group(1) != "<NULL>" else None
    if group is None:
        peer_key_match = re.search(r"Peer Temp Key:\s*(?:ECDH,\s*)?(\S+?),", output)
        group = peer_key_match.group(1) if peer_key_match else None
    cipher_match = re.search(r"Cipher is (\S+)", output)
    cipher = cipher_match.group(1) if cipher_match and cipher_match.group(1) != "(NONE)" else None
    return bytes_read, protocol, group, cipher


async def extract_hostnames(output):
    cert_match = re.search(r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----", output, re.DOTALL)
    if not cert_match:
        return None
    pem = cert_match.group(0).encode()

    try:
        proc = await asyncio.create_subprocess_exec(
            "openssl", "x509", "-noout", "-subject", "-ext", "subjectAltName",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(input=pem), timeout=5)
    except Exception:
        return None

    text = stdout.decode(errors="replace")
    names = []

    cn_match = re.search(r"CN\s*=\s*([^,\n]+)", text)
    if cn_match:
        names.append(cn_match.group(1).strip())

    san_match = re.search(r"Subject Alternative Name:\s*\n\s*(.+)", text)
    if san_match:
        for entry in san_match.group(1).split(","):
            entry = entry.strip()
            if entry.startswith("DNS:"):
                name = entry[4:]
                if name not in names:
                    names.append(name)

    return ", ".join(names) if names else None


async def run_openssl(ip, port, groups, force_tls13, sni_hint, timeout_s, starttls=None):
    cmd = ["openssl", "s_client", "-connect", f"{ip}:{port}", "-groups", groups]
    if starttls:
        cmd += ["-starttls", starttls]
    if force_tls13:
        cmd.append("-tls1_3")
    if sni_hint:
        cmd += ["-servername", sni_hint]
    cmd_str = " ".join(cmd)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(input=b""), timeout=timeout_s)
        return stdout.decode(errors="replace"), False, cmd_str
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except ProcessLookupError:
            pass  # process already exited between the timeout firing and the kill
        await proc.wait()
        return "", True, cmd_str


async def probe_ip(ip, port, sni_hint, handshake_timeout_ms, sem, starttls=None):
    async with sem:
        timeout_s = handshake_timeout_ms / 1000

        output, timed_out, cmd_str = await run_openssl(
            ip, port, PRIMARY_GROUPS, False, sni_hint, timeout_s, starttls
        )
        if timed_out:
            return {
                "ip": ip, "protocol": None, "negotiated_group": None, "cipher": None,
                "outcome": "indeterminate", "command": cmd_str, "hostnames": None,
                "raw": "primary probe timed out",
            }

        bytes_read, protocol, group, cipher = parse_probe_output(output)

        if bytes_read > 0 and protocol:
            if protocol == "TLSv1.3":
                outcome = "pq" if group == "X25519MLKEM768" else "classical"
            elif protocol == "TLSv1.2":
                outcome = "downgrade"
            else:
                outcome = "indeterminate"
            hostnames = await extract_hostnames(output)
            return {
                "ip": ip, "protocol": protocol, "negotiated_group": group,
                "cipher": cipher, "outcome": outcome, "command": cmd_str,
                "hostnames": hostnames, "raw": output,
            }

        fb_output, fb_timed_out, fb_cmd_str = await run_openssl(
            ip, port, FALLBACK_GROUPS, True, sni_hint, timeout_s, starttls
        )
        combined_cmd = cmd_str + "  # (no ServerHello; fallback:)  " + fb_cmd_str
        if fb_timed_out:
            return {
                "ip": ip, "protocol": None, "negotiated_group": None, "cipher": None,
                "outcome": "indeterminate", "command": combined_cmd, "hostnames": None,
                "raw": output + "\n---fallback probe timed out---\n",
            }

        fb_bytes_read, fb_protocol, fb_group, fb_cipher = parse_probe_output(fb_output)
        if fb_bytes_read > 0 and fb_protocol == "TLSv1.3":
            hostnames = await extract_hostnames(fb_output)
            return {
                "ip": ip, "protocol": fb_protocol, "negotiated_group": fb_group,
                "cipher": fb_cipher, "outcome": "intolerant", "command": combined_cmd,
                "hostnames": hostnames, "raw": output + "\n---fallback---\n" + fb_output,
            }

        return {
            "ip": ip, "protocol": None, "negotiated_group": None, "cipher": None,
            "outcome": "indeterminate", "command": combined_cmd, "hostnames": None,
            "raw": output + "\n---fallback---\n" + fb_output,
        }


async def run_scan_streaming(subnets, port, liveness_timeout_ms, handshake_timeout_ms, concurrency, emit, starttls=None):
    ip_sni_pairs = expand_targets(subnets)
    ips = [ip for ip, _ in ip_sni_pairs]
    sni_by_ip = dict(ip_sni_pairs)
    total_ips = len(ips)

    liveness_sem = asyncio.Semaphore(concurrency)
    probe_sem = asyncio.Semaphore(concurrency)

    live_count = 0
    findings = []

    async def handle_ip(ip):
        nonlocal live_count
        try:
            _, alive = await check_live(ip, port, liveness_timeout_ms / 1000, liveness_sem)
            if not alive:
                emit({"stage": "liveness", "ip": ip, "live": False})
                finding = {
                    "ip": ip, "protocol": None, "negotiated_group": None, "cipher": None,
                    "outcome": "unreachable", "command": None, "hostnames": None,
                    "raw": "TCP connect did not succeed within liveness_timeout_ms",
                }
            else:
                live_count += 1
                emit({"stage": "liveness", "ip": ip, "live": True})
                finding = await probe_ip(ip, port, sni_by_ip.get(ip), handshake_timeout_ms, probe_sem, starttls)
        except Exception as exc:
            finding = {
                "ip": ip, "protocol": None, "negotiated_group": None, "cipher": None,
                "outcome": "indeterminate", "command": None, "hostnames": None,
                "raw": f"handler error: {exc!r}",
            }
        findings.append(finding)
        emit({"stage": "probe", **finding})

    await asyncio.gather(*(handle_ip(ip) for ip in ips))

    emit({
        "stage": "done",
        "total_ips": total_ips,
        "live_count": live_count,
        "findings_count": len(findings),
    })
    return findings


# Standardized/shipped hybrid post-quantum SSH key-exchange algorithm names. Both forms of
# the OpenSSH sntrup entry are included since older releases advertise the @openssh.com
# vendor-suffixed name.
KNOWN_PQ_SSH_KEX = {
    "sntrup761x25519-sha512",
    "sntrup761x25519-sha512@openssh.com",
    "mlkem768x25519-sha256",
}


async def probe_ssh(ip, port, timeout_s):
    """Reads the server's SSH_MSG_KEXINIT (RFC 4253 §7.1) and reports whether it
    advertises a post-quantum hybrid key-exchange algorithm. This never completes a key
    exchange and never attempts authentication — KEXINIT is the first message either side
    sends, unauthenticated and unencrypted by protocol design, so this is a pure capability
    read, identical in spirit to how nmap's ssh2-enum-algos and ssh-audit work.
    Returns (alive, finding) — alive reflects TCP-level reachability only."""
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(ip, port), timeout=timeout_s)
    except Exception as exc:
        return False, {
            "ip": ip, "protocol": None, "negotiated_group": None, "cipher": None,
            "outcome": "unreachable", "command": f"raw TCP connect {ip}:{port}",
            "hostnames": None, "raw": f"TCP connect failed: {exc!r}",
        }

    try:
        banner = None
        for _ in range(20):
            line = await asyncio.wait_for(reader.readline(), timeout=timeout_s)
            if not line:
                break
            text = line.decode("utf-8", errors="replace").strip("\r\n")
            if text.startswith("SSH-"):
                banner = text
                break
        if banner is None:
            return True, {
                "ip": ip, "protocol": None, "negotiated_group": None, "cipher": None,
                "outcome": "indeterminate", "command": f"raw SSH banner read {ip}:{port}",
                "hostnames": None, "raw": "no SSH version banner received",
            }

        writer.write(b"SSH-2.0-PQRadarProbe_1.0\r\n")
        await writer.drain()

        length_bytes = await asyncio.wait_for(reader.readexactly(4), timeout=timeout_s)
        packet_length = int.from_bytes(length_bytes, "big")
        if packet_length <= 0 or packet_length > 262144:
            raise ValueError(f"implausible SSH packet length {packet_length}")

        body = await asyncio.wait_for(reader.readexactly(packet_length), timeout=timeout_s)
        padding_length = body[0]
        payload = body[1:packet_length - padding_length]
        if not payload or payload[0] != 20:  # SSH_MSG_KEXINIT
            msg_code = payload[0] if payload else "none"
            raise ValueError(f"expected SSH_MSG_KEXINIT (20), got message code {msg_code}")

        pos = 1 + 16  # message code byte + 16-byte random cookie
        name_list_len = int.from_bytes(payload[pos:pos + 4], "big")
        pos += 4
        kex_algorithms = payload[pos:pos + name_list_len].decode("ascii", errors="replace").split(",")

        pq_hits = [a for a in kex_algorithms if a in KNOWN_PQ_SSH_KEX]
        outcome = "pq" if pq_hits else "classical"
        return True, {
            "ip": ip, "protocol": banner, "negotiated_group": ",".join(kex_algorithms), "cipher": None,
            "outcome": outcome, "command": f"raw SSH KEXINIT capability read {ip}:{port}",
            "hostnames": None, "raw": banner + "\nkex_algorithms: " + ",".join(kex_algorithms),
        }
    except Exception as exc:
        return True, {
            "ip": ip, "protocol": None, "negotiated_group": None, "cipher": None,
            "outcome": "indeterminate", "command": f"raw SSH KEXINIT capability read {ip}:{port}",
            "hostnames": None, "raw": f"handler error: {exc!r}",
        }
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def run_ssh_scan_streaming(subnets, port, timeout_ms, concurrency, emit):
    """Mirrors run_scan_streaming's shape, but SSH's capability read is already a single
    lightweight connection, so liveness and the protocol probe are one step (probe_ssh)
    instead of two."""
    ip_sni_pairs = expand_targets(subnets)
    ips = [ip for ip, _ in ip_sni_pairs]
    total_ips = len(ips)
    timeout_s = timeout_ms / 1000

    sem = asyncio.Semaphore(concurrency)
    live_count = 0
    findings = []

    async def handle_ip(ip):
        nonlocal live_count
        async with sem:
            alive, finding = await probe_ssh(ip, port, timeout_s)
        emit({"stage": "liveness", "ip": ip, "live": alive})
        if alive:
            live_count += 1
        findings.append(finding)
        emit({"stage": "probe", **finding})

    await asyncio.gather(*(handle_ip(ip) for ip in ips))

    emit({
        "stage": "done",
        "total_ips": total_ips,
        "live_count": live_count,
        "findings_count": len(findings),
    })
    return findings
