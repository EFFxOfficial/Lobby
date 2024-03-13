        const socket = io('http://localhost:3000');

        socket.on('loggedIn', async (steamID) => {
            try {
                const response = await fetch(`/getPlayerProfile?steamId=${steamIDToSteamID64(steamID)}`);
                const data = await response.json();
                const displayName = data.displayName;
                const steamAvatar = data.avatar

                localStorage.setItem('steam_steamauth', steamID);
                localStorage.setItem('steam_realname', displayName);
                localStorage.setItem('steam_avatar', steamAvatar);
            } catch (error) {
                
            }
            window.location.reload();
        })

        let mapsDisplayed = false;
        let countdownTimer = 0;

        const userAuthID = localStorage.getItem('steam_steamauth');
        const userName = localStorage.getItem('steam_realname');
        const userAvatar = localStorage.getItem('steam_avatar');
        if (userAuthID) {
            // If logged in, display user details
            const loggedInDiv = document.createElement('div');
            loggedInDiv.classList.add('steamProfile');

            // Create and set up the Steam avatar image
            const steamImg = document.createElement('img');
            steamImg.id = "steamAvatar";
            steamImg.src = userAvatar; // Update path to the Steam avatar
            steamImg.alt = 'Steam Avatar';
            loggedInDiv.appendChild(steamImg);

            // Create a container for the user's name and logout button
            const userInfoContainer = document.createElement('div');
            userInfoContainer.classList.add('nameContainer')

            // Display the user's name
            const userNameDiv = document.createElement('div');
            userNameDiv.textContent = userName;
            userInfoContainer.appendChild(userNameDiv);

            // Create the log out button with embedded icon
            const logOutBtn = document.createElement('button');
            logOutBtn.name = 'logout';
            logOutBtn.id = 'logOut';
            logOutBtn.type = 'submit';
            logOutBtn.style.background = 'none';
            logOutBtn.style.color = 'white';
            logOutBtn.style.border = 'none';

            // Create and set up the log out icon
            const logOutIcon = document.createElement('i');
            logOutIcon.classList.add('fas', 'fa-sign-out-alt');
            logOutIcon.style.color = 'white';
            logOutIcon.style.marginRight = '.5rem';
            logOutIcon.style.fontSize = '1.2rem';
            logOutIcon.style.cursor = 'pointer';
            logOutBtn.appendChild(logOutIcon);

            // Append the logout button to the user info container
            userInfoContainer.appendChild(logOutBtn);

            // Append the user info container to the logged in div
            loggedInDiv.appendChild(userInfoContainer);

            // Append the logged in div to the client element
            document.getElementById('client').appendChild(loggedInDiv);
        } else {
            // If not logged in, create a login button with Steam image
            const loginBtn = document.createElement('a');
            loginBtn.href = '/auth/steam';
        
            // Create and set up the Steam login image
            const steamImg = document.createElement('img');
            steamImg.src = './assets/sits_01.png'; // Update path to the Steam login image
            steamImg.alt = 'Steam Login';
            loginBtn.appendChild(steamImg);
        
            // Append the login button to the client element
            document.getElementById('client').appendChild(loginBtn);
        }
    
        const logoutButton = document.getElementById("logOut")
        if(logoutButton){
            logoutButton.addEventListener('click', () => {
                socket.emit('leaveLobby', userAuthID);

                localStorage.removeItem('steam_steamauth')
                localStorage.removeItem('steam_realname')
                localStorage.removeItem('steam_avatar');

                window.location.reload();
            })
        }

        const states = {
            ready: 1,
            teamJoin: 2,
            leave: 3,
            deleteLobby: 4,
            sendMessage: 5,
            mapList: 6,
            kick: 7
        }

        setInterval(function() { 
            if(userAuthID){
                socket.emit('checkState', ({userAuthID, type: states.ready}))
                socket.emit('checkState', ({userAuthID, type: states.teamJoin}))
                socket.emit('checkState', ({userAuthID, type: states.leave}))
                socket.emit('checkState', ({userAuthID, type: states.deleteLobby}))
                socket.emit('checkState', ({userAuthID, type: states.sendMessage}))
                socket.emit('checkState', ({userAuthID, type: states.mapList}))
                socket.emit('checkState', ({userAuthID, type: states.kick}))
            }
            else{
                manageButtonState("#readyButton", true)
                manageButtonState("#joinTeam1", true)
                manageButtonState("#joinTeam2", true)
                manageButtonState("#leaveLobby", true)
                manageButtonState("#deleteLobby", true)

                const mapButtons = document.querySelectorAll('.mapInput')
                mapButtons.forEach((butt) => {
                    manageButtonState(butt, true)
                })
            }
        }, 100)

        socket.on('callbackResponse', (callbackResponse, type) => {
            switch(type){
                case states.ready:{
                    manageButtonState("#readyButton", callbackResponse)
                    break;
                }
                case states.teamJoin:{
                    if(isTeamFull('team1')){
                        manageButtonState("#joinTeam1", true)
                    }
                    else{
                         manageButtonState("#joinTeam1", callbackResponse)
                    }

                    if(isTeamFull('team2')){
                        manageButtonState("#joinTeam2", true)
                    }
                    else{
                        manageButtonState("#joinTeam2", callbackResponse)
                    }
                    break;
                }
                case states.leave:{
                    manageButtonState("#leaveLobby", callbackResponse)
                    break;
                }
                case states.deleteLobby:{
                    manageButtonState("#deleteLobby", callbackResponse)
                    break;
                }
                case states.sendMessage:{
                    manageButtonState("#messageInput", callbackResponse)
                    break;
                }
                case states.mapList:{
                    const mapButtons = document.querySelectorAll('.mapInput')
                    mapButtons.forEach((butt) => {
                        manageButtonState(butt, callbackResponse)
                    })
                    break;
                }
                case states.kick:{
                    const mapButtons = document.querySelectorAll('.kickButton')
                    mapButtons.forEach((butt) => {
                        manageButtonState(butt, callbackResponse)
                    })
                    break;
                }
            }
        })

        // Function to check if a team is full
        function isTeamFull(team) {
            const players = document.querySelectorAll(`.${team}`);
            return players.length >= 5
        }

        document.getElementById('deleteLobby').addEventListener('click', async () => {
            socket.emit('clearLobby', userAuthID);
            document.getElementById('timerBarContainer').style.display = 'none'
            document.getElementById('timerBar').style.width = "0"
            document.getElementById('chosingHeader').innerHTML = '';
        });

        document.getElementById('registerRandomUser').addEventListener('click', async () => {
            let randomID = Math.floor(Math.random() * 2147483647);
            let randomTeam = Math.floor(Math.random() * 2) == 1 ? "team1" : "team2";

            if(isTeamFull(randomTeam)){
                randomTeam = (randomTeam === "team1") ? "team2" : "team1"
            }

            if(isTeamFull("team1") && isTeamFull("team2")){
                alertMessage('Both teams are full')
                return
            }
            socket.emit('joinTeam', { team: randomTeam, userAuthID: randomID.toString(), random: true });
        });
    
        // Handle joining Team 1
        document.getElementById('joinTeam1').addEventListener('click', async () => {
            const team = 'team1';
            if (!userAuthID) {
                alertMessage("Not logged in")
                return;
            }
            if (!isTeamFull(team)) {
                socket.emit('joinTeam', { team, userAuthID, random: false, userAvatar, userName }); // Emit 'joinTeam' event with team and Steam ID
            } else {
                alertMessage("This team is full")
            }
        });
    
        // Handle joining Team 2
        document.getElementById('joinTeam2').addEventListener('click', async () => {
            const team = 'team2';
            if (!userAuthID) {
                alertMessage("Not logged in")
                return;
            }
            if (!isTeamFull(team)) {
                socket.emit('joinTeam', { team, userAuthID, random: false, userAvatar, userName }); // Emit 'joinTeam' event with team and Steam ID
            } else {
                alertMessage("This team is full")
            }
        });

        function manageButtonState(buttonId, state) {
            if (typeof buttonId === 'string') {
                const idWithoutPrefix = buttonId.substring(1); // Remove the first character
                if (buttonId[0] === '#') {
                    document.getElementById(idWithoutPrefix).disabled = state;
                } 
            }
            else {
                buttonId.disabled = state;
            }
        }

        // Check if a team was previously joined
        window.onload = function() {
            socket.emit('pageLoad')
        };

        // Modify ready button click event to use player ID and disable the button
        document.getElementById('readyButton').addEventListener('click', () => {
            socket.emit('markReady', userAuthID);
        });
    
        // Handle leaving the lobby
        document.getElementById('leaveLobby').addEventListener('click', () => {
            socket.emit('leaveLobby', userAuthID);
        });
    
        // Handle receiving lobby updates from the server
        socket.on('updateLobby', (players) => {
            if(players.length === 0){
                document.getElementById('mapList').innerHTML = '';
            }
            const team1Players = document.getElementById('team1Players');
            const team2Players = document.getElementById('team2Players');
        
            // Clear the current lobby list
            team1Players.innerHTML = '';
            team2Players.innerHTML = '';
        
            // Get the current user's team
            const currentUserTeam = getCurrentUserTeam(players, userAuthID); // You need to implement this function
            const iamLeader = isUserLeader(players, userAuthID);

            // Populate the lobby list with updated player information
            players.forEach(player => {
                const li = document.createElement('li');
                li.classList.add(`${player.team}`);

                const kickButton = player.team === currentUserTeam && !player.leader && iamLeader ? '<button class="kickButton" data-user-auth-id="' + player.userAuthID + '">Kick</button>' : '<div style="margin-top: 1.5rem"></div>'
                li.innerHTML = `
                    <div class="playerContainer">
                        <div class="avatarContainer">
                            ${player.leader ? '<img src="./assets/crown.png" alt="Crown" class="crownImage"/>' : kickButton}
                            <img src="${player.userAvatar}" alt="User avatar" class="userAvatar"/>
                        </div>
                        <div class="userData">
                            <span>
                                <b>
                                    ${player.userName}
                                </b>
                            </span>
                            ${player.elo ? '<span>ELO: ' + player.elo + '</span>' : ''}
                        </div>
                    </div>
                `;
                if (player.team === 'team1') {
                    team1Players.appendChild(li);
                } else if (player.team === 'team2') {
                    team2Players.appendChild(li);
                }
            });
        
            if (players.length === 0) {
                const messageList = document.getElementById('messageList');
                messageList.innerHTML = ''; // Clear the message container
            }
        });

        socket.on('teamReady', (team) => {
            document.getElementById(team).innerHTML = '[READY]'
        })

        function getCurrentUserTeam(players, userAuthID) {
            const player = players.find(player => player.userAuthID === userAuthID);
            if (player) {
                return player.team;
            } else {
                return null; // Return null if the user is not found in the players array
            }
        }

        function isUserLeader(players, userAuthID) {
            const player = players.find(player => player.userAuthID === userAuthID);
            if (player) {
                return player.leader;
            } else {
                return null; // Return null if the user is not found in the players array
            }
        }

        document.addEventListener('click', function(event) {
            if (event.target.classList.contains('kickButton')) {
                const targetUserAuthID = event.target.getAttribute('data-user-auth-id');
                socket.emit('kickPlayer', ({userAuthID, targetUserAuthID }));
            }
        });

        socket.on('allPlayersReady', () => {
            alertMessage('All players ready. Captains shall ban the maps.', true)
            setTimeout(function() {
                socket.emit('avaliableMaps')

                document.querySelector('#mapList').style.marginBlock = "3rem 1rem";
                document.getElementById("readyStatus1").innerHTML = '';
                document.getElementById("readyStatus2").innerHTML = '';

            }, 2000)
        })

        socket.on('averageELO', ({team1, team2}) => {
            document.getElementById('teamElo1').innerHTML = team1
            document.getElementById('teamElo2').innerHTML = team2
        })

        socket.on('alreadyJoined', () => {
            alertMessage('Already in a team')
        })

        socket.on('notJoined', () => {
            alertMessage('You are not in any team')
        })
    
        socket.on('alreadyReady', () => {
            alertMessage('Already ready')
        })
    
        socket.on('noPlayers', () => {
            alertMessage('There are no players avaliable')
        })

        socket.on('notCreator', () => {
            alertMessage('You are not the leader of the lobby.')
        })

        socket.on('notInSameTeam', () => {
            alertMessage('This player is not your teammate')
        })

        socket.on('allMessages', (allMessages) => {
            // Display all messages on the client-side
            allMessages.forEach(message => {
                displayMessage(message);
            });
        });

        function displayMessage(message) {
            const messageList = document.getElementById('messageList');
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="messageContainer">
                    <div class="avatarContainer" style="flex-direction: row;">
                        <span>(${message.team == 'team1' ? 'Team A' : 'Team B'})</span>
                        <img src="${message.userAvatar}" alt="User avatar" style="width: 20px;"/>
                    </div>
                    <div class="messageContent">
                        <span><b>${message.userName}:</b></span>
                        <span>${message.message}</span>
                        <span style="color: grey">${message.time}</span>
                    </div>
                </div>
            `;
            messageList.appendChild(li);
        }

        socket.on('checkUserAuthenticationStatus', (authID) => {
            let callbackResponse = false;
            if(userAuthID == authID){
                callbackResponse = true;
            }
            socket.emit('userAuthentificationResponse', ({callbackResponse, authID}))
        })

        let currentAlert = null; // Variable to keep track of the current alert
        function alertMessage(message) {
            if (currentAlert) {
                // If there's already an alert, remove it
                document.body.removeChild(currentAlert);
            }

            // Create a new alert container
            const alertContainer = document.createElement('div');
            alertContainer.classList.add('alertContainer');
            alertContainer.textContent = message;
            document.body.appendChild(alertContainer);

            // Set currentAlert to the new alert container
            currentAlert = alertContainer;

            // Remove the alert after 2 seconds
            setTimeout(() => {
                alertContainer.classList.add('hide');
                setTimeout(() => {
                    document.body.removeChild(alertContainer);
                    currentAlert = null; // Reset currentAlert
                }, 1000); // Wait for the hide animation to finish
            }, 2000); // Display the message for 2 seconds
        }

        function steamIDToSteamID64(steamID) {
            const parts = steamID.split(':');
            const authServer = parts[1];
            const accountId = parts[2];
            const steam64Id = BigInt(accountId) * BigInt(2) + BigInt(76561197960265728) + BigInt(authServer);
            return steam64Id.toString();
        }

        document.getElementById('messageInput').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prevent the default behavior of Enter key (usually submitting a form)
                const messageInput = event.target;
                const message = messageInput.value.trim();
                if (message) {
                    socket.emit('sendMessage', { userAuthID, message });
                    messageInput.value = ''; // Clear the input field after sending
                }
            }
        });
        
        // Rendering received messages
        socket.on('receiveMessage', ({ team, userAvatar, userName, message, time }) => {
            const messageList = document.getElementById('messageList');
            const li = document.createElement('li');

            let teamName = 0;
            if(team){
                teamName = team === 'team1' ? 'Team A' : 'Team B';
            }
            li.innerHTML = `
                <div class="messageContainer">
                    <div class="avatarContainer" style="flex-direction: row;">
                        ${team ? '<span>(' + teamName + ')</span>' : ''}
                        ${userAvatar ? '<img src="' + userAvatar + '" alt="User avatar" style="width: 20px;"/>' : ''}
                    </div>
                    <div class="messageContent">
                        ${userName ? '<span><b>' + userName + ':</b></span>' : ''}
                        <span style="${userAvatar ? '' : 'color: #565656'}">${message}</span>
                        <span style="color: grey">${time}</span>
                    </div>
                </div>
            `;
            messageList.appendChild(li);
        });

        const mapList = document.getElementById('mapList');
        socket.on('mapsAvaliableCallback', (maps) => {
            const mapContainer = document.getElementById('mapList');
            if(mapContainer){
                mapContainer.innerHTML = '';
            }

            // Create tick boxes for each available map
            maps.forEach((map) => {
                const checkbox = document.createElement('input');
                checkbox.setAttribute('type', 'checkbox');
                checkbox.setAttribute('class', 'mapInput');
                checkbox.setAttribute('id', map);
                checkbox.setAttribute('name', 'map');
                checkbox.setAttribute('value', map);
        
                const label = document.createElement('label');
                label.setAttribute('for', map);
                label.textContent = map;
        
                mapContainer.appendChild(checkbox);
                mapContainer.appendChild(label);
                mapContainer.appendChild(document.createElement('br'));
            });

            const checkboxes = document.querySelectorAll('.mapInput');
            checkboxes.forEach(function(checkbox) {
                checkbox.addEventListener('click', function() {
                    socket.emit('updateMapSelection', { mapName: checkbox.value, checked: checkbox.checked, userAuth: userAuthID });
                });
            });

            socket.on('removeCheckbox', (mapName) => {
                const checkboxToRemove = document.getElementById(mapName);
                if (checkboxToRemove) {
                    checkboxToRemove.parentNode.removeChild(checkboxToRemove);
                    const labelToRemove = document.querySelector(`label[for="${mapName}"]`);
                    if (labelToRemove) {
                        labelToRemove.parentNode.removeChild(labelToRemove); // Remove label
                    }
                }
            });
        });

        socket.on('alertLive', ({timer, remainingMap, scoreT, scoreCT}) =>{
            const minutes = Math.floor(timer / 60);
            const seconds = timer % 60;
            const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            document.body.style.backgroundImage = `url(./assets/maps/${remainingMap}.jpg)`
            document.getElementById('chosingHeader').innerHTML = `
                <span id="scoreboard">${scoreT} : ${scoreCT}</span>
                <br>
                <span style="color: grey">MATCH IS LIVE</span>
                <span style="color: grey">${formattedTime}</span>
            `
        })

        socket.on('alertRemainingMap', ({ remainingMap, remainingTime }) => {
            if(countdownTimer){
                clearInterval(countdownTimer)
            }
            document.querySelector('#mapList').style.marginBlock = "0";

            // Format the remaining time in minutes and seconds
            const minutes = Math.floor(remainingTime / 60);
            const seconds = remainingTime % 60;
            const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
            // Update the HTML elements with the formatted time
            document.getElementById('timerBarContainer').style.display = 'none';
            document.getElementById('mapList').innerHTML = '';
            document.getElementById('timerBar').innerHTML = '';
            document.getElementById('chosingHeader').innerHTML = `
                <img src="https://image.gametracker.com/images/maps/160x120/cs/${remainingMap}.jpg" />
                <div class="matchData">
                    <div class="ipContainer">
                        <span>Server IP: <b>131.196.198.246:27350</b></span>
                        <button id="copyIP" onclick="copyToClipboard('131.196.198.246:27350')"> 
                            <svg width="11" height="11" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" class="Vrr2SX">
                                <path clip-rule="evenodd" d="M1 0C0.447715 0 0 0.447715 0 1V9C0 9.55229 0.447715 10 1 10H9C9.55229 10 10 9.55228 10 9V1C10 0.447715 9.55228 0 9 0H1ZM4 13C4 12.4477 4.44772 12 5 12H12V5C12 4.44772 12.4477 4 13 4C13.5523 4 14 4.44772 14 5V13C14 13.5523 13.5523 14 13 14H5C4.44772 14 4 13.5523 4 13Z" fill-rule="evenodd"></path>
                            </svg>
                        </button>
                    </div>
                    <div id="waitingPlayers">Waiting for players <span id="playersCountDown">${formattedTime}</span></div>
                </div>
            `;
        });

        function copyToClipboard(ip){
            navigator.clipboard.writeText(ip)
        }
        
        socket.on('updateMapSelectionStatus', (otherPlayer) => {
            // Logic to update UI or perform any other necessary actions
            document.getElementById("chosingHeader").innerHTML = otherPlayer.userName + ' is now choosing the map.';
        });

        // Add event listener for removing the checkbox
        socket.on('removeMapCheckbox', () => {
            // Remove checkbox from UI
            document.getElementById('mapCheckbox').remove();
        });

        // Add event listener for updating the timer bar
        socket.on('updateTimer', (remainingTime) => {
            if(document.getElementById('timerBarContainer').style.display !== 'block'){
                document.getElementById('timerBarContainer').style.display = 'block'
            }
            // Calculate progress percentage
            const progress = (1 - remainingTime / 10000) * 100;
            // Update the width of the timer bar
            document.getElementById('timerBar').style.width = progress + '%';

            const mapList = document.querySelector('#mapList')
            if (!mapList.innerHTML.trim()) {
                if(countdownTimer){
                    clearInterval(countdownTimer)
                }

                mapList.style.marginBlock = "3rem 1rem";
                socket.emit('requestUpdate');
            }
        });

        socket.on('matchEnded', ({remainingMap, scoreT, scoreCT}) => {
            document.getElementById('chosingHeader').innerHTML = `
                <img src="https://image.gametracker.com/images/maps/160x120/cs/${remainingMap}.jpg" />
                <br>
                MATCH FINISHED
                <br>
                Team A [${scoreT} - ${scoreCT}] Team B
            `

            document.getElementById('teamElo1').innerHTML = ''
            document.getElementById('teamElo2').innerHTML = ''
        })
