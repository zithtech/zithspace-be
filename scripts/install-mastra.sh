#!/bin/bash

# Mastra AI Agent Installation Script for Zithmi Backend
# This script installs the required Mastra dependencies

echo "=================================="
echo "Mastra AI Agent Installation"
echo "=================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the z-backend-v2 directory."
    exit 1
fi

echo "📦 Installing Mastra dependencies..."
echo ""

# Install Mastra packages
npm install @mastra/core@latest @mastra/memory@latest @mastra/engine@latest

# Check if installation was successful
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Mastra dependencies installed successfully!"
    echo ""
    echo "=================================="
    echo "Next Steps:"
    echo "=================================="
    echo ""
    echo "1. Add your OpenAI API key to .env:"
    echo "   OPENAI_API_KEY=your_key_here"
    echo ""
    echo "2. Set the API base URL in .env:"
    echo "   API_BASE_URL=http://localhost:3001/api"
    echo ""
    echo "3. Start the backend:"
    echo "   npm run dev"
    echo ""
    echo "4. Test the agent:"
    echo "   curl -X POST http://localhost:3001/api/agent/chat \\"
    echo "     -H \"Content-Type: application/json\" \\"
    echo "     -H \"Authorization: Bearer YOUR_TOKEN\" \\"
    echo "     -H \"x-tenant-id: YOUR_TENANT_ID\" \\"
    echo "     -d '{\"message\": \"Show me all projects\", \"stream\": false}'"
    echo ""
    echo "For more information, see MASTRA_SETUP.md"
    echo ""
else
    echo ""
    echo "❌ Installation failed. Please check the errors above."
    exit 1
fi
