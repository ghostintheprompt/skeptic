#!/bin/bash

# Skeptic Release Script
# Builds the project and packages it for release

echo "Starting release build for Skeptic v1.1.0..."

# Clean previous builds
npm run clean

# Build the project
npm run build

# Package the build
echo "Packaging release..."
zip -r skeptic-v1.1.0.zip dist package.json package-lock.json server.ts aiService.ts tsconfig.json .env.example README.md LICENSE icon.png

echo "Release package created: skeptic-v1.1.0.zip"
echo "Next steps:"
echo "1. Tag the release: git tag v1.1.0 && git push origin v1.1.0"
echo "2. Upload skeptic-v1.1.0.zip to the GitHub Release."
