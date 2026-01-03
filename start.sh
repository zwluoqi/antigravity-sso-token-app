#!/bin/bash

echo "Starting Kiro Account Manager..."
echo

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo
fi

# Start the application
echo "Starting application..."
npm start