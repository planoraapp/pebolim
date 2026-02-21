import { Server } from "socket.io";
import http from "http";

const server = http.createServer();
const io = new Server(server, {
    cors: {
        origin: "*",
    },
});

let waitingPlayer = null;
const matches = new Map(); // roomId -> matchState

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("joinQueue", () => {
        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            // Match found!
            const roomId = `room_${waitingPlayer.id}_${socket.id}`;
            const opponent = waitingPlayer;
            waitingPlayer = null;

            socket.join(roomId);
            opponent.join(roomId);

            // Notify both players
            // Player 1 (the one who was waiting) will be at the bottom (P1)
            // Player 2 (the one who just joined) will be at the top (P2)
            opponent.emit("matchFound", { roomId, playerRole: "p1", opponentId: socket.id });
            socket.emit("matchFound", { roomId, playerRole: "p2", opponentId: opponent.id });

            console.log(`Match created: ${roomId}`);
        } else {
            waitingPlayer = socket;
            console.log("Player waiting in queue:", socket.id);
        }
    });

    socket.on("syncState", (data) => {
        // Forward state to the other player in the room
        socket.to(data.roomId).emit("remoteState", data);
    });

    socket.on("goal", (data) => {
        socket.to(data.roomId).emit("remoteGoal", data);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }
        // Handle mid-game disconnects if needed
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Matchmaking server running on port ${PORT}`);
});
