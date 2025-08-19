
# Bonk.io Parkour Collab

A collab tool for the game bonk.io where multiple users can draw shapes on a shared canvas. The shapes can be exported to the game. Intended for parkour.

## Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/elder-tubby/bonkio-parkour-collab.git
cd bonkio-parkour-collab
```

2. Install dependencies:
```bash
npm install
```

## Development

To run the application in development mode:

```bash
npm run dev
```

This will start the server with nodemon for automatic restarts on file changes.

## Production Build & Deployment

### Building the Application

```bash
npm run build
```

Note: This application doesn't require a separate build step as it serves static files directly. The build command is available for compatibility with deployment scripts.

### Starting the Application

```bash
npm start
```

This will start the server on the configured port (default: 3000).

### Environment Variables

- `PORT` - Server port (default: 3000)

### Production Deployment

1. Clone the repository on your server
2. Install dependencies: `npm install`
3. Set environment variables if needed
4. Start the application: `npm start`

For production use with PM2 (process manager):

```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start index.js --name "bonkio-parkour-collab"

# Save PM2 configuration
pm2 save
pm2 startup
```



## File Structure

```
├── public/                 # Client-side files
│   ├── index.html         # Main HTML file
│   ├── app.js            # Main client application
│   ├── ui.js             # UI management
│   ├── canvas.js         # Canvas drawing logic
│   ├── network.js        # WebSocket client
│   └── ...               # Other client modules
├── config.js             # Application configuration
├── index.js              # Main server file
├── gameManager.js        # Game state management
├── lobbyManager.js       # Lobby management
├── utils.js              # Server utilities
└── package.json          # Dependencies and scripts
```

## How It Works

1. **Server**: Node.js with Express serves static files and handles WebSocket connections via Socket.IO
2. **Client**: Vanilla JavaScript with HTML5 Canvas for real-time collaborative drawing
3. **Real-time Communication**: Socket.IO enables real-time synchronization between clients
4. **Game Logic**: Server manages game state, player actions, and broadcasts updates to all connected clients

## API Endpoints

- `GET /` - Serves the main application
- WebSocket events handled via Socket.IO for real-time features

## Browser Support

- Modern browsers with HTML5 Canvas and WebSocket support
- Chrome, Firefox, Safari, Edge (recent versions)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please create an issue in the GitHub repository.
