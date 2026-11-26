FROM postgres:16-alpine
# pg_dump / psql come with the base image; openssl encrypts, tzdata gives India time for the schedule.
RUN apk add --no-cache openssl tzdata
ENV TZ=Asia/Kolkata
COPY backup.sh restore.sh entrypoint.sh /backup/
RUN chmod +x /backup/*.sh
ENTRYPOINT ["/backup/entrypoint.sh"]
