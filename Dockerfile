# Use a lightweight Node.js image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm ci

# Copy the rest of the application files
COPY . .

# Build the client-side SPA and compile the Express server
RUN npm run build

# Prune devDependencies to keep container size small
RUN npm prune --production

# Expose port 3000 (the port set in server.ts)
EXPOSE 3000

# Define default environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["npm", "start"]
