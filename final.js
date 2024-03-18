const https = require("https");
const { client } = require('../dbConnection');
require('dotenv').config();

 
client.connect();
 
async function getSession(senderId) {
    try {
        const result = await client.query('SELECT * FROM sessions WHERE sender_id = $1', [senderId]);
 
        if (result.rows.length > 0) {
            return result.rows[0].session_data;
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error getting session from PostgreSQL:', error);
        throw error;
    }
}
 
async function sendReply(phone_number_id, whatsapp_token, to, replyMessage) {
    try {
        const json = {
            messaging_product: "whatsapp",
            to: to,
            text: { body: replyMessage },  
        };
 
        console.log('Sending reply to:', to);
 
        const data = JSON.stringify(json);
        const path = `/v18.0/${phone_number_id}/messages`;
 
        const options = {
            host: "graph.facebook.com",
            path: path,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + whatsapp_token
            }
        };
 
        const response = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let str = "";
                res.on("data", (chunk) => {
                    str += chunk;
                });
                res.on("end", () => {
                    resolve(str);
                });
            });
 
            req.on("error", (e) => {
                console.error('Error sending request:', e);
                reject(e);
            });
 
            req.write(data);
            req.end();
        });
 
        console.log('Response from WhatsApp API:', response);
 
        return response;
    } catch (error) {
        console.error('Error in sendReply:', error);
        throw error;
    }
}
 
exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event));
 
    try {
        if (!event || !event.requestContext || !event.requestContext.http || !event.requestContext.http.method || !event.requestContext.http.path) {
            console.error('Invalid event:', event);
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid event' }),
            };
        }
 
        console.log('Received HTTP method:', event.requestContext.http.method);
 
        const WHATSAPP_TOKEN = process.env.whatsapp_Token;
 
        if (event.requestContext.http.method === "GET") {
            const queryParams = event.queryStringParameters;
            if (queryParams) {
                const mode = queryParams["hub.mode"];
                const verifyToken = queryParams["hub.verify_token"];
                const challenge = queryParams["hub.challenge"];
 
                if (mode === "subscribe" && verifyToken === process.env.VERIFY_TOKEN) {
                    return {
                        statusCode: 200,
                        body: challenge,
                        isBase64Encoded: false
                    };
                } else {
                    const responseBody = "Error, wrong validation token";
                    return {
                        statusCode: 403,
                        body: JSON.stringify(responseBody),
                        isBase64Encoded: false
                    };
                }
            } else {
                const responseBody = "Error, no query parameters";
                return {
                    statusCode: 403,
                    body: JSON.stringify(responseBody),
                    isBase64Encoded: false
                };
            }
        } else if (event.requestContext.http.method === 'POST') {
            const body = JSON.parse(event.body);
 
            if (body && body.entry) {
                for (const entry of body.entry) {
                    for (const change of entry.changes) {
                        const value = change.value;
 
                        if (value != null && value.messages != null) {
                            const phone_number_id = value.metadata.phone_number_id;
 
                            for (const message of value.messages) {
    const senderId = message.from;
 
    let session = await getSession(senderId);
    if (!session) {
        session = {};
    }
 
    switch (message.type) {
        case 'text':
            console.log('Received text message:', message.text);
           
            // Forward the received message to your WhatsApp number
            //const forwardMessage = `Received message from ${senderId}: ${message.text}`;
            await sendReply(phone_number_id, WHATSAPP_TOKEN, senderId);
   
            // Debugging: Print the received message
            console.log('Received message:', message.text);
   
            // Auto-reply logic
            let receivedMessage = '';
            if (typeof message.text === 'string') {
                receivedMessage = message.text.toLowerCase(); // Convert message to lowercase for case-insensitive matching
            } else if (message.text && typeof message.text === 'object' && message.text.body) {
                receivedMessage = message.text.body.toLowerCase(); // Extract message body and convert to lowercase
            } else {
                console.log('Invalid message format:', message.text);
                break;
            }
   
            // Debugging: Print the received lowercase message
            console.log('Received lowercase message:', receivedMessage);
   
            // Check if the received message contains a specific keyword or phrase
            let autoReplyMessage = '';
            if (receivedMessage.includes('hello')) {
                autoReplyMessage = 'Hello! Thank you for reaching out. How can I assist you today?';
            } else if (receivedMessage.includes('help')) {
                autoReplyMessage = 'Sure, I\'m here to help! What do you need assistance with?';
            } else {
                autoReplyMessage = 'This is an auto-reply. Thank you for your message!';
            }
   
            // Send the auto-reply message
            await sendReply(phone_number_id, WHATSAPP_TOKEN, senderId, autoReplyMessage);
            break;
   
 
                                    case 'order':
                                        console.log('Received order message:', message.order);
                                        // Implement processing order message
                                        break;
 
                                    case 'interactive':
                                        console.log('Received interactive message:', message.interactive);
                                        // Implement processing interactive message
                                        break;
 
                                    default:
                                        console.log('Received unknown message type:', message.type);
                                        break;
                                }
                            }
                        }
                    }
                }
            }
 
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Done' }),
                isBase64Encoded: false,
            };
        } else {
            const responseBody = 'Unsupported method';
            return {
                statusCode: 405,
                body: JSON.stringify(responseBody),
                isBase64Encoded: false,
            };
        }
    } catch (error) {
        console.error('Error in handler:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' }),
            isBase64Encoded: false,
        };
    }
};