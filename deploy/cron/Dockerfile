# Minimal scheduler image: alpine + curl running tick.sh. Built by the `cron`
# service in docker-compose.yml.
FROM alpine:3.20
RUN apk add --no-cache curl tzdata
COPY tick.sh /tick.sh
RUN chmod +x /tick.sh
ENTRYPOINT ["/tick.sh"]
