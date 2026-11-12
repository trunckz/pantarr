# pantarr-keep: optional companion for the Google Keep list sync (docker compose --profile keep)
FROM python:3.12-slim
RUN pip install --no-cache-dir gkeepapi==0.17.1 && useradd -r -u 1001 keep
COPY server.py /app/server.py
USER keep
EXPOSE 8080
HEALTHCHECK CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/health')"
CMD ["python", "/app/server.py"]
