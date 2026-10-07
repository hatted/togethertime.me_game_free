# Use the official Apache HTTP Server image as the base
FROM httpd:2.4

# Copy your website files from the local 'public-html' folder to the Apache document root in the container
COPY . /usr/local/apache2/htdocs/

# The base image automatically exposes port 80 and starts the Apache server,
# so no EXPOSE or CMD commands are strictly necessary for this simple case

