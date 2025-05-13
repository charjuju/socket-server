const express = require('express');
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:5173", "https://app.marzatp.fr"],
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

let connectedUsers = {}; // { userId: { socketId, username, token } }

// Connexion Socket.IO
io.on("connection", (socket) => {
    console.log("🟢 Un utilisateur est connecté");

    // Authentification avec JWT
    socket.on("authenticate", async (token) => {
        try {
            console.log("🔎 Demande d'infos à Strapi...");
            const response = await axios.get(`${process.env.STRAPI_URL}/api/users/me`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const userId = response.data.documentId;
            const username = response.data.username;

            // Associer l'ID de l'utilisateur Strapi avec le socket ID
            connectedUsers[userId] = {
                socketId: socket.id,
                username: username,
                token: token // 🔐 On garde le token pour stocker les messages ensuite
            };

            console.log(`✅ ${username} (ID: ${userId}) connecté avec socket ID : ${socket.id}`);
        } catch (error) {
            console.error("❌ Authentification échouée :", error.message + `${process.env.STRAPI_URL}`);
            socket.disconnect();
        }
    });

    // Réception d'un message
    socket.on("sendMessage", async (messageData, callback) => {
        const userId = Object.keys(connectedUsers).find(
            id => connectedUsers[id].socketId === socket.id
        );

        if (!userId) {
            if (callback) callback({ success: false, message: "Utilisateur non authentifié" });
            return;
        }

        const sender = connectedUsers[userId].username;
        const { content, receiverId } = messageData;

        if (!content || typeof content !== "string" || content.trim() === "") {
            if (callback) callback({ success: false, message: "Contenu du message invalide." });
            return;
        }

        const fullMessage = {
            content,
            sender,
            receiverId
        };

        console.log(`📨 Message de ${sender} : "${content}"`);

        try {
            // 💾 Enregistrement dans Strapi
            await axios.post(`${process.env.STRAPI_URL}/api/messages`, {
                data: {
                    content,
                    sender: userId,
                    receiver: receiverId
                }
            }, {
                headers: {
                    Authorization: `Bearer ${process.env.BEARER}`
                }
            });

            // Trouver le socket ID du destinataire
            const receiverSocketId = connectedUsers[receiverId]?.socketId;

            if (receiverSocketId) {
                io.to(receiverSocketId).emit("receiveMessage", fullMessage);
                console.log(`📤 Envoyé à ${receiverId}`);
            } else {
                console.log("❌ L'utilisateur cible n'est pas connecté.");
            }

            if (callback) callback({ success: true, message: "Message envoyé et stocké." });

        } catch (err) {
            console.error("❌ Erreur d'envoi ou de stockage :", err.message);
            if (callback) callback({ success: false, message: "Erreur d'envoi ou de stockage." });
        }
    });

    // Déconnexion
    socket.on("disconnect", () => {
        const userId = Object.keys(connectedUsers).find(
            id => connectedUsers[id].socketId === socket.id
        );

        if (userId) {
            const username = connectedUsers[userId].username;
            delete connectedUsers[userId];
            console.log(`🔴 ${username} (ID: ${userId}) est déconnecté`);
        }
    });
});

server.listen(3003, () => {
    console.log("✅ Serveur Socket.IO en écoute sur http://localhost:3003");
});
