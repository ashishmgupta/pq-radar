FROM ubuntu:25.10

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.py .

EXPOSE 8080
CMD ["python3", "server.py"]
