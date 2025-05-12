const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5174",
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
            const response = await axios.get('http://localhost:1337/api/users/me', {
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
            console.error("❌ Authentification échouée :", error.message);
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
            await axios.post('http://localhost:1337/api/messages', {
                data: {
                    content,
                    sender: userId,
                    receiver: receiverId
                }
            }, {
                headers: {
                    Authorization: `Bearer ccd008e7ed443b8e9cab7eeb2b535a96be876a69ec62147f7fb3e4464dcd5e48432042889537b177ed698ce5a5a7642c1c1a9fb106b08016040ed5fdacaa70897b75014889918fd7df1bce118f0b2d7b19d4aad7e32dbfedf0de08deae4fde0d488c87e5aeb1e331af2de262bbf87ab7d1feaa8eacd0346bf1bebadfb1abb538`
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
