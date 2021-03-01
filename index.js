require("dotenv").config()
const Discord = require('discord.js');
const express = require("express");
const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const app = express();
const port = process.env.PORT || 8000;
const crypto = require("crypto");
const twitchSigningSecret = process.env.TWITCH_WEBHOOK_SECRET;
const webhookClient = new Discord.WebhookClient(process.env.DISCORD_HOOKID, process.env.DISCORD_WEBHOOK_SECRET);

var twitchAppToken;
getTwitchToken()


const verifyTwitchSignature = (req, res, buf, encoding) => {
    const messageId = req.header("Twitch-Eventsub-Message-Id");
    const timestamp = req.header("Twitch-Eventsub-Message-Timestamp");
    const messageSignature = req.header("Twitch-Eventsub-Message-Signature");
    const time = Math.floor(new Date().getTime() / 1000);
    console.log(`Message ${messageId} Signature: `, messageSignature);

    if (Math.abs(time - timestamp) > 600) {
        // needs to be < 10 minutes
        console.log(`Verification Failed: timestamp > 10 minutes. Message Id: ${messageId}.`);
        throw new Error("Ignore this request.");
    }

    if (!twitchSigningSecret) {
        console.log(`Twitch signing secret is empty.`);
        throw new Error("Twitch signing secret is empty.");
    }

    const computedSignature =
        "sha256=" +
        crypto
            .createHmac("sha256", twitchSigningSecret)
            .update(messageId + timestamp + buf)
            .digest("hex");
    console.log(`Message ${messageId} Computed Signature: `, computedSignature);

    if (messageSignature !== computedSignature) {
        throw new Error("Invalid signature.");
    } else {
        console.log("Verification successful");
    }
};

app.use(express.json({ verify: verifyTwitchSignature }));


app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.post("/webhooks/callback", async (req, res) => {
    const messageType = req.header("Twitch-Eventsub-Message-Type");
    if (messageType === "webhook_callback_verification") {
        console.log("Verifying Webhook");
        return res.status(200).send(req.body.challenge);
    }

    const { type } = req.body.subscription;
    const { event } = req.body;

    console.log(
        `Receiving ${type} request for ${event.broadcaster_user_name}: `,
        event
    );

    sendMessage(event)

    res.status(200).end();
});

const listener = app.listen(port, () => {
    console.log("Your app is listening on port " + listener.address().port);
});


function getTwitchToken() {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams();
        params.append('client_id', process.env.TWITCH_APP_ID);
        params.append('client_secret', process.env.TWITCH_APP_SECRET);
        params.append('grant_type', 'client_credentials');


        fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: params })
            .then(res => res.json())
            .then(json => {
                setTimeout(getTwitchToken, json.expires_in)
                twitchAppToken = json.access_token
                /*sendMessage({
                    id: '41261025260',
                    broadcaster_user_id: '109322347', broadcaster_user_login: 'legonzaur',
                    broadcaster_user_name: 'Legonzaur',
                    type: 'live', started_at: '2021-03-01T19:21:58Z'
                })*/
                resolve(json.access_token)
            });
    })
}

function getTwitchChannelData(userID) {
    return new Promise((resolve, reject) => {

        const params = new URLSearchParams();
        params.append('user_id', userID);

        fetch('https://api.twitch.tv/helix/streams?' + params, {
            method: 'GET', headers: {
                "client-id": process.env.TWITCH_APP_ID,
                "Authorization": "Bearer " + twitchAppToken
            }
        })
            .then(res => res.json())
            .then(json => {
                resolve(json)
            });
    })
}
function getTwitchUserData(userID) {
    return new Promise((resolve, reject) => {

        const params = new URLSearchParams();
        params.append('id', userID);

        fetch('https://api.twitch.tv/helix/users?' + params, {
            method: 'GET', headers: {
                "client-id": process.env.TWITCH_APP_ID,
                "Authorization": "Bearer " + twitchAppToken
            }
        })
            .then(res => res.json())
            .then(json => {
                resolve(json)
            });
    })
}
function getTwitchGameData(gameID) {
    return new Promise((resolve, reject) => {

        const params = new URLSearchParams();
        params.append('id', gameID);

        fetch('https://api.twitch.tv/helix/games?' + params, {
            method: 'GET', headers: {
                "client-id": process.env.TWITCH_APP_ID,
                "Authorization": "Bearer " + twitchAppToken
            }
        })
            .then(res => res.json())
            .then(json => {
                if (json.data.length == 0) {
                    getTwitchGameData()
                }
                resolve(json)
            });
    })
}


async function sendMessage(event) {
    let streamData = (await getTwitchChannelData(event.broadcaster_user_id)).data[0]
    let userData = (await getTwitchUserData(event.broadcaster_user_id)).data[0]
    console.log("streamData", streamData)
    console.log("userData", userData)
    if (streamData) {

        let embed = new Discord.MessageEmbed()
            .setTitle(`${event.broadcaster_user_name} est en Live !`)
            .setColor('#0099ff')
            .setImage(streamData.thumbnail_url.replace("{width}", "480").replace("{height}", "270") + "?rand=" + Math.floor(Math.random() * 1000))
            .setTimestamp()
            .setDescription(streamData.game_name)
            .setAuthor(event.broadcaster_user_name, userData.profile_image_url, 'https://www.twitch.tv/' + streamData.user_name)
            .setURL('https://www.twitch.tv/' + streamData.user_name)
            .addField(streamData.title, 'https://www.twitch.tv/' + streamData.user_name)
        //.setThumbnail('avatarURL')
        let gameData = (await getTwitchGameData(streamData.game_id)).data[0]
        if (gameData) {
            embed.setThumbnail(gameData.box_art_url.replace("{width}", "232").replace("{height}", "320"))
        }

        webhookClient.send('', {
            username: 'M. Frog',
            avatarURL: 'https://media.discordapp.net/attachments/473452865138982944/816014015318065182/Sticker_Gregre_business_frog.png',
            embeds: [embed],
        })
    } else {
        setTimeout(() => {
            sendMessage(event)
        }, 5000)
    }
}
