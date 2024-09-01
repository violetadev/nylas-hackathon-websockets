const axios = require('axios');
const WebSocket = require('ws');
const dotenv = require('dotenv');
const express = require('express');

dotenv.config()
const port = process.env.PORT || 3000;
const app = express();

const wss = new WebSocket.Server({ port });

async function createCalendarEvent({calendarId, apiKey, grantId, user1, user2}) {
    const url = `https://api.us.nylas.com/v3/grants/${grantId}/events?calendar_id=${calendarId}`;
    const headers = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };

    const startTime = Math.floor(Date.now() / 1000);
    const endTime = startTime + 45 * 60;

    const eventData = {
        title: `Meeting between ${user1.name} and ${user2.name}`,
        status: "confirmed",
        busy: true,
        participants: [
            { email: user1.email },
            { email: user2.email }
        ],
        when: {
            start_time: startTime,
            end_time: endTime
        },
        location: "Virtual",
        conferencing: {
            provider: 'Google Meet',
            autocreate: {}
        },
    };

    try {
        const response = await axios.post(url, eventData, { headers });

        return response.data.data.conferencing.details.url;
    } catch (error) {
        console.error('Failed to create calendar event:', error.response?.data || error.message);
        throw error;
    }
}
 
let queue = [];

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        const user = JSON.parse(message)
        queue.push({ user, ws });

        if (queue.length >= 2) {
            const [user1, user2] = [queue.shift(), queue.shift()];
            try {
                const meetingLink = await createCalendarEvent({
                    grantId: process.env.NYLAS_GRANT_ID, 
                    calendarId: process.env.GOOGLE_CALENDAR_ID, 
                    apiKey: process.env.NYLAS_API_KEY, 
                    user1: user1.user, 
                    user2: user2.user
                });

                const message = {link: meetingLink, error: false}

                user1.ws.send(JSON.stringify({...message, matchedWith: user2.user}))
                user2.ws.send(JSON.stringify({...message, matchedWith: user1.user}));
                
                console.log(`Matched ${user1.user.name} with ${user2.user.name}. Meeting link: ${meetingLink}`);
            } catch (error) {
                const errorMessage = JSON.stringify({link: null, matchedWith: null, error: true})
                user1.ws.send(errorMessage);
                user2.ws.send(errorMessage);
            }
        }
    });

    ws.on('close', () => {
        queue = queue.filter(user => user.ws !== ws);
        console.log('User disconnected and removed from queue');
    });
});

console.log(`WebSocket server is running on port ${port}`);
