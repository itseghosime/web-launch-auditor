FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 AUDITOR_DB_PATH=/data/scans.sqlite3
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --uid 10001 auditor \
    && mkdir /data && chown auditor:auditor /data
COPY web_audit ./web_audit
USER auditor
EXPOSE 8000
CMD ["uvicorn", "web_audit.api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
