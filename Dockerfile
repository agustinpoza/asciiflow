FROM gcr.io/bazel-public/bazel:8.2.1 as build
WORKDIR /build
COPY . .
RUN bazel build site/... --remote_cache= --bes_backend= --bes_results_url=

FROM nginx:alpine
COPY --from=build /build/bazel-bin/site /usr/share/nginx/html
EXPOSE 80
