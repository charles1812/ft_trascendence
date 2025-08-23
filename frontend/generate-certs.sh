#!/bin/sh

set -euo pipefail

certs_dir="/etc/nginx/certs"
hostname_file="$certs_dir/.hostname"

# Check if hostname has changed
if [ -f "$hostname_file" ]; then
    old_hostname=$(cat "$hostname_file")
    if [ "$old_hostname" != "${FRONTEND_HOST}" ]; then
        echo "Hostname changed from $old_hostname to ${FRONTEND_HOST}, regenerating certificates..."
        rm -f "$certs_dir/cert.pem" "$certs_dir/key.pem"
    fi
fi

if [ ! -f "$certs_dir/cert.pem" ] || [ ! -f "$certs_dir/key.pem" ]; then
    echo "Generating self-signed SSL certificates for ${FRONTEND_HOST}..."

    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$certs_dir/key.pem" \
        -out "$certs_dir/cert.pem" \
        -subj "/CN=${FRONTEND_HOST}" \
        -addext "subjectAltName=DNS:${FRONTEND_HOST},DNS:localhost,IP:127.0.0.1"

    chmod 644 "$certs_dir/cert.pem"
    chmod 600 "$certs_dir/key.pem"

    # Store current hostname
    echo "${FRONTEND_HOST}" >"$hostname_file"

    echo "SSL certificates generated successfully for ${FRONTEND_HOST}"
else
    echo "SSL certificates already exist for ${FRONTEND_HOST}, skipping generation"
fi
