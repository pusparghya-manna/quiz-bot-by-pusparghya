FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN apk add --no-cache maven && mvn -q -DskipTests package && \
    mv /app/target/quiz-bot-*.jar /app/target/app.jar

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN adduser -D appuser && apk add --no-cache wget
COPY --from=build /app/target/app.jar /app/app.jar
USER appuser
EXPOSE 8080
ENV PORT=8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD wget -qO- http://127.0.0.1:${PORT:-8080}/health || exit 1
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-jar", "/app/app.jar"]
