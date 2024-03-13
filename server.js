const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const SteamStrategy = require('passport-steam').Strategy;
const session = require('express-session');
const passport = require('passport');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Set up sessions
app.use(session({
    secret: 'ekek20339318181',
    resave: true,
    saveUninitialized: true
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Serialize user
passport.serializeUser(function(user, done) {
    done(null, user);
});
  
// Deserialize user
passport.deserializeUser(function(user, done) {
    done(null, user);
});

// Set up Steam authentication strategy
passport.use(new SteamStrategy({
    returnURL: 'http://localhost:3000/auth/steam/callback',
    realm: 'http://localhost:3000/',
    apiKey: '240E98CA222BEA870AB24F5AD6B8CCEE'
}, function(identifier, profile, done) {
    const steamId = identifier.match(/\d+$/)[0];
    return done(null, { steamId: steamId });
}));

let steamID = '';

// Routes for Steam authentication
app.get('/auth/steam', passport.authenticate('steam'));
app.get('/auth/steam/callback',
    passport.authenticate('steam', { failureRedirect: '/' }),
    function(req, res) {
        // Successful authentication, redirect or emit loggedIn event with SteamID
        if (req.user && req.user.steamId) {
            steamID = convertSteamID64ToSteamID(req.user.steamId);
        }
        res.redirect('/');
    }
);

// Route to get SteamID
app.get('/steamid', (req, res) => {
    if (req.user && req.user.steamId) {
        steamID = convertSteamID64ToSteamID(req.user.steamId);
    }
    res.redirect('/');
});

app.get('/getPlayerProfile', async (req, res) => {
    const { steamId } = req.query;
    try {
        const response = await axios.get(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=240E98CA222BEA870AB24F5AD6B8CCEE&steamids=${steamId}`);

        const profileData = response.data.response.players[0];
        const displayName = profileData.personaname;
        const avatar = profileData.avatarfull; // Use avatarfull for the full-sized avatar image
        res.json({ displayName, avatar });
    } catch (error) {
    }
});

// Define a map to store player information by their unique index
const players = new Map();

const MAP_CHOOSE_DELAY = 5000
const UPDATE_SERVER_LIVE = 1000;

const TIMER_WAITING_FOR_PLAYERS = 5; // minutes
const MIN_PLAYERS = 10;
const MIN_READY = 2;

let totalELOTeam1 = 0;
let totalELOTeam2 = 0;
let numPlayersTeam1 = 0;
let numPlayersTeam2 = 0;
let readyCount = 0;
let liveTimerCount = 0;
let blockAllButtons = false;
let bMatchStarted = false;
let alertLobbyStatus;
let liveTimerInterval;
let mapSelectionTimer;
let statisticsInterval;
let mapSelectionEndTime;

const jsonFilePath = 'lobbyState.json'
const messagesFilePath = 'messages.json';

let bTeamReady = [];
let messages = [];

const states = {
    ready: 1,
    teamJoin: 2,
    leave: 3,
    deleteLobby: 4,
    sendMessage: 5,
    mapList: 6,
    kick: 7
}

const mapsList = {
    de_nuke: true,
    de_train: true/*,
    de_mirage: true,
    de_tuscan: true,
    de_inferno: true,
    de_dust2: true*/
};

function readLobbyState() {
    return new Promise((resolve, reject) => {
        fs.readFile(jsonFilePath, (err, data) => {
            if (err) {
                reject(err); // If there's an error reading the file, reject the promise
                return;
            }
            try {
                const lobbyState = JSON.parse(data); // Parse the JSON data
                resolve(lobbyState);
            } catch (error) {
                reject(error); // If there's an error parsing the JSON data, reject the promise
            }
        });
    });
}

// Function to write the lobby state to the lobbyState.json file
function writeLobbyState(lobbyState) {
    const jsonData = JSON.stringify(lobbyState, null, 2);

    // Write JSON data to a file named 'lobbyState.json'
    fs.writeFile(jsonFilePath, jsonData, (err) => {
        if (err) {
        }
    });
}

function fetchPlayerDetails(userAuthID, random) {
    return new Promise((resolve, reject) => {
        fs.readFile('playerDetails.json', (err, data) => {
            if (err) {
                reject(err); // If there's an error reading the file, reject the promise
                return;
            }
            try {
                const playerDetails = JSON.parse(data); // Parse the JSON data
                const firstKey = Object.keys(playerDetails)[0]
                resolve(random ? playerDetails[firstKey] : playerDetails[userAuthID] || {}); // Resolve with the player details if found, or an empty object otherwise
            } catch (error) {
                reject(error); // If there's an error parsing the JSON data, reject the promise
            }
        });
    });
}

clearLobbyMessages()
readMessagesFromFile()

// Socket.io event handler for client connections
io.on('connection', (socket) => {
    console.log("user connected")

    if(steamID){
        socket.emit('loggedIn', (steamID))
        steamID = 0;
    }
    readLobbyState()
    .then((lobbyState) => {
        io.emit('updateLobby', lobbyState); // Emit the initial lobby state to all clients
    })
    .catch((error) => {
    });
    
    // Add 'joinTeam' event handler to assign a unique player ID and track players
    socket.on('joinTeam', async ({ team, userAuthID, random, userAvatar, userName }) => {
        // Generate a unique player ID
        const playerID = uuidv4(); // Generate unique ID
        if(isUserJoined(userAuthID)) {
            io.emit('alreadyJoined');
            return; // Don't allow the player to join again
        }
    
        try {
            if(userAvatar == null){
                userAvatar = './assets/default_avatar.jpg'
            }

            if(userName == null){
                userName = 'Unknown'
            }

            const { elo, ranking } = await fetchPlayerDetails(userAuthID, random);
            const isFirstPlayerOfTeam = players.size === 0 || ![...players.values()].some(player => player.team === team);
            const mapOrder = players.size === 0

            if(random && isFirstPlayerOfTeam){
                readyCount++;

                bTeamReady[team == 'team1' ? 0 : 1] = true
                socket.emit('teamReady', team == 'team1' ? 'readyStatus1' : 'readyStatus2')
            }

            const playerTeam = team === 'team1' ? 'A' : 'B'
            logMessage('Player ' + userName + ' joined Team ' + playerTeam)

            players.set(playerID, {id: playerID, userAuthID, team, ready: random ? true : false, leader: isFirstPlayerOfTeam, userAvatar, elo, ranking, userName, mapOrder });
            io.emit('updateLobby', Array.from(players.values()));
            // Save lobby state to JSON file
            saveLobbyState();

            // Increment the total ELO and number of players for the respective team
            if (team === 'team1') {
                totalELOTeam1 += elo;
                numPlayersTeam1++;
            } else if (team === 'team2') {
                totalELOTeam2 += elo;
                numPlayersTeam2++;
            }

            const avgELOTeam1 = numPlayersTeam1 === 0 ? 0 : totalELOTeam1 / numPlayersTeam1;
            const avgELOTeam2 = numPlayersTeam2 === 0 ? 0 : totalELOTeam2 / numPlayersTeam2;
            io.emit('averageELO', { team1: avgELOTeam1, team2: avgELOTeam2 });

        } catch (error) {
        }
    });

    // Add 'markReady' event handler to track ready players
    socket.on('markReady', (userAuthID) => {
        if(!isUserJoined(userAuthID)){
            io.emit('notJoined')
            return;
        }

        // Update player's ready status in the map
        const playerId = getPlayerIdByUserAuthId(userAuthID);
        if (playerId) {
            const player = players.get(playerId);
            if (player.ready === true) {
                io.emit('alreadyReady');
                return; // Don't allow the player to join again
            }

            player.ready = true;
            bTeamReady[player.team == 'team1' ? 0 : 1] = true;

            const playerTeam = player.team == 'team1' ? 'A' : 'B'
            logMessage('Team ' + playerTeam + ' is ready')

            socket.emit('teamReady', player.team == 'team1' ? 'readyStatus1' : 'readyStatus2')
            io.emit('updateLobby', Array.from(players.values()));
            saveLobbyState();

            readyCount++;
            if(readyCount >= MIN_READY){
                io.emit('allPlayersReady')

                const firstLeader = Array.from(players.values()).find(player => player.mapOrder === true);
                if (firstLeader) {
                    firstLeader.choosingMap = true;
                }
                blockAllButtons = true
            }
        }
    });

    // Function to get player ID by userAuthID
    function getPlayerIdByUserAuthId(userAuthID) {
        return Array.from(players.keys()).find(playerId => players.get(playerId).userAuthID === userAuthID);
    }

    // Add 'leaveLobby' event handler to remove player from the map
    socket.on('leaveLobby', (userAuthID) => {
        handleLobbyDisconnection(userAuthID)
    });

    function handleLobbyDisconnection(userAuthID) {
        if (!isUserJoined(userAuthID)) {
            io.emit('notJoined');
            return; 
        }
    
        const playerId = getPlayerIdByUserAuthId(userAuthID);
        const deletedPlayer = players.get(playerId);
    
        logMessage('Player ' + deletedPlayer.userName + ' disconnected')
        // Check if the leaving player was the leader
        const wasLeader = deletedPlayer.leader;
        players.delete(playerId);
    
        // If the leaving player was the leader and there are other players in the lobby
        if (wasLeader && players.size > 0) {
            readyCount--

            const teamPlayers = Array.from(players.values()).filter(player => player.team === deletedPlayer.team);
    
            // Ensure there's more than one player in the team
            if (teamPlayers.length >= 1) {
                // Select the second player in the same team to be the new leader
                const newLeader = teamPlayers[0]; // Get the second player
                if (newLeader) {
                    newLeader.leader = true; // Set the leader property for the new leader
                    saveLobbyState(); // Save lobby state after updating the leader
                }
            }
        }
    
        const arrayCount = Array.from(players.values());
        io.emit('updateLobby', arrayCount);
    }

    // Socket.io event handler for disconnections
    socket.on('disconnected', (userAuth) => {
        console.log("user disconnected")
    });

    socket.on('clearLobby', (userAuthID) => {
        manageClearLobby(userAuthID)
    })

    function manageClearLobby(userAuthID){
        const playerId = getPlayerIdByUserAuthId(userAuthID);
        if (playerId) {
            const player = players.get(playerId);
            if(player.leader === true)
            {
                manageLobbyClear()
            }
        }
    }

    function manageLobbyClear(){
        blockAllButtons = false;
        bMatchStarted = false;

        liveTimerCount = 0;
        readyCount = 0;
        mapsBanned = 0;

        players.clear(); // Clear all players from the lobby

        clearLobbyMessages();
        clearInterval(mapSelectionTimer)

        for (const map in mapsList) {
            mapsList[map] = true;
        }

        bTeamReady[0] = bTeamReady[1] = false;

        
        io.emit('mapsAvaliableCallback', Object.keys(mapsList));
        io.emit('updateLobby', []); // Emit 'updateLobby' event to notify clients about the empty lobby
        saveLobbyState(); // Save lobby state to JSON file
    }

    socket.on('pageLoad', () => {
        const playerData = Array.from(players.values());
        io.emit('updateLobby', playerData);
        io.emit('allMessages', messages);

        if(bTeamReady[0]){
            socket.emit('teamReady', 'readyStatus1')
        }

        if(bTeamReady[1]){
            socket.emit('teamReady', 'readyStatus2')
        }

        const avgELOTeam1 = numPlayersTeam1 === 0 ? 0 : totalELOTeam1 / numPlayersTeam1;
        const avgELOTeam2 = numPlayersTeam2 === 0 ? 0 : totalELOTeam2 / numPlayersTeam2;
        io.emit('averageELO', { team1: avgELOTeam1, team2: avgELOTeam2 });
    });

    socket.on('checkState', ({ userAuthID, type }) => {
        let callbackResponse = false
        if(!userAuthID){
            io.emit('callbackResponse', callbackResponse)
            return
        }
        else{
            switch(type){
                case states.ready:{
                    const playerId = getPlayerIdByUserAuthId(userAuthID);
                    const player = players.get(playerId);
                    if (playerId) {
                        if (player.ready === true) {
                            callbackResponse = true
                        }
                    }
                    else if(!isUserJoined(userAuthID)){
                        callbackResponse = true
                    }
                    else if(readyCount >= MIN_READY){
                        callbackResponse = true
                    }
                    
                    if(player && player.leader === false){
                        callbackResponse = true
                    }

                    if (MIN_PLAYERS && Array.from(players.values()).length < MIN_PLAYERS) {
                        callbackResponse = true;
                    }
                    break;
                }
                case states.teamJoin:{
                    if(isUserJoined(userAuthID)){
                        callbackResponse = true
                    }
                    break;
                }
                case states.leave:{
                    if(!isUserJoined(userAuthID)){
                        callbackResponse = true
                    }
                    break;
                }
                case states.deleteLobby:{
                    const playerId = getPlayerIdByUserAuthId(userAuthID);
                    const player = players.get(playerId);
                    if(player && player.leader === false || !isUserJoined(userAuthID)){
                        callbackResponse = true
                    }
                    break;
                }
                case states.sendMessage:{
                    if(!isUserJoined(userAuthID)){
                        callbackResponse = true
                    }
                    break;
                }
                case states.mapList:{
                    const playerId = getPlayerIdByUserAuthId(userAuthID);
                    const player = players.get(playerId);
                    if(player && player.leader === false || !isUserJoined(userAuthID)){
                        callbackResponse = true
                    }

                    if(player && player.choosingMap === false){
                        callbackResponse = true
                    }
                    break;
                }
            }

            if(blockAllButtons 
                && type !== states.mapList
                && type !== states.sendMessage){
                callbackResponse = true
            }
            io.emit('callbackResponse', callbackResponse, type)
        }
    })

    socket.on('kickPlayer', ({ userAuthID, targetUserAuthID }) => {
        const playerId = getPlayerIdByUserAuthId(targetUserAuthID)
        const kickerId = getPlayerIdByUserAuthId(userAuthID)

        const player = players.get(playerId);
        const kicker = players.get(kickerId);
        logMessage('Captain ' + kicker.userName + ' kicked ' + player.userName + ' from the lobby.')

        handleLobbyDisconnection(targetUserAuthID);
        io.emit('updateLobby', Array.from(players.values()));
    });

    socket.on('userAuthentificationResponse', ({callbackResponse, userAuthID}) => {
        if(!callbackResponse){
            //handleLobbyDisconnection(userAuthID)
        }
    })
    
    // Socket.io event handler for sending messages
    socket.on('sendMessage', ({ userAuthID, message }) => {
        if (!userAuthID || !message) return; // Ignore if userAuthID or message is missing
        const playerId = getPlayerIdByUserAuthId(userAuthID);
        if (playerId) {
            const player = players.get(playerId);
            if (player) {
                const { userAvatar, userName, team } = player;
                const currentTime = getCurrentTime(); // Get current time in "15:32" format
                const newMessage = { team, userAvatar, userName, message, time: currentTime }; // Include team information and time in the message object
                messages.push(newMessage); // Store the message in memory
                saveMessagesToFile(); // Save messages to JSON file
                io.emit('receiveMessage', newMessage); // Broadcast the message to all clients
            }
        }
    });
    
    // Function to get current time in "15:32" format
    function getCurrentTime() {
        const date = new Date();
        const hours = String(date.getHours()).padStart(2, '0'); // Get hours and pad with leading zero if needed
        const minutes = String(date.getMinutes()).padStart(2, '0'); // Get minutes and pad with leading zero if needed
        return `${hours}:${minutes}`; // Return formatted time string
    }

    function logMessage(message){
        const currentTime = getCurrentTime(); // Get current time in "15:32" format
        const newMessage = {  message, time: currentTime }; // Include team information and time in the message object
        messages.push(newMessage); // Store the message in memory
        saveMessagesToFile(); // Save messages to JSON file
        io.emit('receiveMessage', newMessage);
    }

    socket.on('avaliableMaps', () => {
        startCountdownTimer
        // Send the list of available maps to the client
        io.emit('mapsAvaliableCallback', Object.keys(mapsList));
        logMessage('Starting map selection.')
        const currentPlayer = Array.from(players.values()).find(player => player.choosingMap);
        if (currentPlayer) {
            // Emit an event to the client indicating that the current player should start the countdown timer
            io.emit('updateMapSelectionStatus', currentPlayer)

            mapSelectionEndTime = Date.now() + MAP_CHOOSE_DELAY; // 10 seconds delay
            startCountdownTimer();
        }
    });
    
    socket.on('updateMapSelection', ({ mapName, userAuth }) => {
        const playerId = getPlayerIdByUserAuthId(userAuth);
        if (!playerId) {
            return;
        }
    
        const player = players.get(playerId);
    
        // If the player is not a leader or has already made a map selection, ignore
        if (!player.leader || player.choosingMap === false) {
            return;
        }
        logMessage('Captain ' + player.userName + ' banned ' + mapName);
    
        // Toggle the state of the selected map
        mapsList[mapName] = !mapsList[mapName];
    
        // Update the choosingMap state for both captains
        player.choosingMap = false;
        players.forEach(otherPlayer => {
            if (otherPlayer.team !== player.team && otherPlayer !== player) {
                otherPlayer.choosingMap = true;
                io.emit('updateMapSelectionStatus', otherPlayer); // Emit event to update map selection status
            }
        });
    
        if(mapSelectionTimer){
            clearInterval(mapSelectionTimer)
        }

        // Check if there's only one map remaining
        const remainingMapCount = Object.values(mapsList).filter(value => value === true).length;
        if (remainingMapCount === 1) {
            // Find the remaining map
            
            const remainingMap = Object.keys(mapsList).find(map => mapsList[map] === true);
            if (remainingMap) {
                // Emit alert with the remaining map

                logMessage('Map selection finished. Result: ' + remainingMap)
                let remainingTimeInSeconds = TIMER_WAITING_FOR_PLAYERS * 60;
                alertLobbyStatus = setInterval(function() {
                    // Read lobby state from the file
                    fs.readFile(jsonFilePath, 'utf8', (err, data) => {
                        if (err) {
                            return;
                        }
                
                        // Parse the JSON data
                        const lobbyData = JSON.parse(data);

                        // Check if all players are connected
                        if (!lobbyData.connected) {
                            // Execute code if all players are connected
                
                            // Emit alert with the remaining map
                            io.emit('alertRemainingMap', { remainingMap, remainingTime: remainingTimeInSeconds });
                            remainingTimeInSeconds--;
                
                            // Check if the remaining time is less than 0
                            if (remainingTimeInSeconds < 0) {
                                manageLobbyClear();
                                clearInterval(alertLobbyStatus);
                            }
                        } else {
                            // Clear the interval if not all players are connected
                            if(lobbyData.finished){
                                io.emit('matchEnded', ({remainingMap, scoreT: lobbyData.scoreT, scoreCT: lobbyData.scoreCT}));
                                logMessage('Map finished: TeamA (' + lobbyData.scoreT + ') TeamB (' + lobbyData.scoreCT + ')')

                                clearInterval(statisticsInterval)
                                clearInterval(alertLobbyStatus)
                                clearInterval(liveTimerInterval)

                                manageLobbyClear();
                            }
                            else{
                                if(!liveTimerInterval){
                                    logMessage('All players joined. The match has started.')
                                    liveTimerInterval = setInterval(function() {
                                        liveTimerCount += 1
                                    }, UPDATE_SERVER_LIVE)       
                                }
                                io.emit('alertLive', ({timer: liveTimerCount, remainingMap, scoreT: lobbyData.scoreT, scoreCT: lobbyData.scoreCT}));
                            }
                        }
                    });
                }, 1000);

                fs.readFile(jsonFilePath, 'utf8', (err, data) => {
                    if (err) {
                        return;
                    }
        
                    // Parse the existing JSON data
                    const lobbyData = JSON.parse(data);
        
                    // Update the map in the lobby data
                    lobbyData.map = remainingMap;
                    lobbyData.start = Date.now();
                    lobbyData.open = 1;
                    lobbyData.connected = 0;
                    lobbyData.scoreT = 0;
                    lobbyData.scoreCT = 0;
                    lobbyData.finished = 0;
        
                    // Convert the updated lobby data back to JSON format
                    const updatedJsonData = JSON.stringify(lobbyData, null, 2);
        
                    // Write the updated JSON data back to the file
                    fs.writeFile(jsonFilePath, updatedJsonData, 'utf8', err => {
                        if (err) {
                            return;
                        }
                    });
                });
            }
        }
    
        // Clear the map selection timer
        clearInterval(mapSelectionTimer);
        // Emit to remove checkbox for everyone
        io.emit('removeCheckbox', mapName)
    
        if(remainingMapCount > 1){
             // Set the end time of map selection
            mapSelectionEndTime = Date.now() + MAP_CHOOSE_DELAY; // 10 seconds delay
            // Start the countdown timer
            startCountdownTimer();
        }
    });

    socket.on('requestUpdate', () => {
        if(bMatchStarted)
            return
        
        io.emit('updateMapSelectionStatus', Array.from(players.values()).find(player => player.choosingMap));
        io.emit('mapsAvaliableCallback', Object.keys(mapsList).filter(key => mapsList[key]));
    })

    function startCountdownTimer() {
        const remainingTime = Math.max(0, mapSelectionEndTime - Date.now());
        io.emit('updateTimer', remainingTime);
    
        mapSelectionTimer = setInterval(() => {
            const remainingTime = Math.max(0, mapSelectionEndTime - Date.now());
            io.emit('updateTimer', remainingTime);
    
            // If time is up, stop the timer
            if (remainingTime === 0) {
                clearInterval(mapSelectionTimer);
                // Swap choosingMap status to the other leader
                const currentPlayer = Array.from(players.values()).find(player => player.choosingMap);
                const otherPlayer = Array.from(players.values()).find(player => player !== currentPlayer);
                currentPlayer.choosingMap = false;
                otherPlayer.choosingMap = true;
    
                io.emit('updateMapSelectionStatus', otherPlayer); // Emit event to update map selection status
                mapSelectionEndTime = Date.now() + MAP_CHOOSE_DELAY; // 10 seconds delay
                startCountdownTimer();
            }
        }, 1000); // Update timer every second
    }
    

    // Define a function to check user authentication
    function checkUserAuthentication() {
        // Iterate through each player in the players map
        players.forEach(player => {
            const userAuthID = player.userAuthID;
            // Check if the userAuthID is present in the players map
            io.emit('checkUserAuthenticationStatus', userAuthID);
        });
    }

    // Set up a periodic task to check user authentication every 1 second
    setInterval(checkUserAuthentication, 1000);
    // Load messages from file on server start
    readMessagesFromFile();
});

function isUserJoined(userAuthID){
    const playerAlreadyInTeam = Array.from(players.values()).some(player => player.userAuthID === userAuthID);
    return playerAlreadyInTeam;
}

function clearLobbyMessages() {
    messages = []; // Clear all messages from memory
    saveMessagesToFile(); // Save an empty array to the JSON file
}

// Function to read messages from JSON file
function readMessagesFromFile() {
    try {
        const data = fs.readFileSync(messagesFilePath, 'utf8');
        messages = JSON.parse(data);
    } catch (error) {
    }
}

// Function to save messages to JSON file
function saveMessagesToFile() {
    try {
        fs.writeFileSync(messagesFilePath, JSON.stringify(messages, null, 2));
    } catch (error) {
    }
}

// Function to save lobby state to a JSON file
function saveLobbyState() {
    const lobbyState = {
        team1: [],
        team2: []
    };

    players.forEach((player) => {
        if (player.team === 'team1') {
            lobbyState.team1.push(player.userAuthID);
        } else if (player.team === 'team2') {
            lobbyState.team2.push(player.userAuthID);
        }
    });
    writeLobbyState(lobbyState);
}

function convertSteamID64ToSteamID(steamID64) {
    const steamID64Constant = BigInt('76561197960265728'); // Base SteamID64 constant
    const steamID64BigInt = BigInt(steamID64);
    
    // Subtract the base SteamID64 constant from the SteamID64
    const result = (steamID64BigInt - steamID64Constant);
    
    // Divide the result by 2
    const quotient = result / BigInt(2);
    const remainder = result % BigInt(2);
    
    return 'STEAM_0:' + remainder + ':' + quotient;
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
