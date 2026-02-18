// using sets the timezone equal to the timezone in the sheet settings
var TIMEZONE = Session.getScriptTimeZone();
const gmtTimezone = "GMT";
var now = new Date();

// Enable error trapping for API requests
const options = {muteHttpExceptions: true};


// This sheet Names
const scoreboard = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Scoreboard Real-Time");
const scheduleSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Schedule");
const gameStatsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Game Stats');

// Main Sheet Names
const mainSheet = SpreadsheetApp.openById("11GAbZkgwWAYOzVXknpmkibX-qTsxKldZVrA8aWokwBA");
const mainSchedule = mainSheet.getSheetByName("Schedule");
const rosterSheet = mainSheet.getSheetByName("Rosters")


// Player Ids and Player Names
const allPlayers = rosterSheet.getRange(2,4,rosterSheet.getLastRow()-1).getValues().flat();
const playerNameSheet = rosterSheet.getRange(2,8,rosterSheet.getLastRow()-1).getValues().flat();
const playersNames = {}
for (let i = 0; i < allPlayers.length; i++){
  playersNames[allPlayers[i]] = playerNameSheet[i];
}

// All the roster Teams
const rosterTeams = rosterSheet.getRange(2, 6, rosterSheet.getLastRow() - 1).getValues().flat();


// Getting the Teams and the players on the teams
let teamIDs = rosterSheet.getRange(2, 6, rosterSheet.getLastRow() - 1).getValues().flat();
let allPlayerInformation = rosterSheet.getRange(2, 4, rosterSheet.getLastRow()-1, 3).getValues();
const teamLineps = {};

// Initialize teamLineps with empty arrays for each team ID
for (let i = 0; i < teamIDs.length; i++) {
  teamLineps[teamIDs[i]] = [];
}

// Add players to their respective teams
for (let i = 0; i < allPlayerInformation.length; i++) {
  let player = allPlayerInformation[i][0];     // Player name or ID
  let teamID = allPlayerInformation[i][2];     // Team ID
  if (teamLineps[teamID]) {                    // Check if the team ID exists
    teamLineps[teamID].push(player);
  }
}




function scoreboardRTCheckTimeAndDay(){
  var day = now.getDay(); // getDay() returns 0 (Sunday) to 6 (Saturday)
  var hour = now.getHours(); // get the current hour
  var minutes = now.getMinutes(); // get the current minute
  if(hour === 3){
    gameStats();
    writeTimestamp();
  }
  else if(hour > 11 && minutes % 5 === 0){
    // constantGameStats();
    constantGameStatsGPT();
    writeTimestamp();
  }
}


function writeTimestamp() {
  var now = new Date();
  var timestampDate = Utilities.formatDate(now, TIMEZONE, "MM/dd/yyyy");
  var timestampTime = Utilities.formatDate(now, TIMEZONE, "E hh:mm a");
  scoreboard.getRange('AI1').setValue(timestampDate);
  scoreboard.getRange('AI2').setValue(timestampTime);
}




function gameStats(){
  let games = scheduleSheet.getRange(2,3,scheduleSheet.getLastRow()-1,1).getValues().flat();

  const newRows = [["GameID","Date","Time","Status","Player ID","Player Names","Concat (Formula)","State","Points","Status (Formula)"]]; //,"Concat (Formula)","State (Formula)", "Points (Formula)", "Status (Formula)"]];
  for (let i = 0; i < games.length; i++) {
    let gameNumber = games[i];
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${gameNumber}`;

    let concatFormula = '=CONCATENATE(INDIRECT("E" & Row()),"_",INDIRECT("B" & Row()))';
    let statusFormula = '=IF(INDIRECT("H" & Row())="pre",INDIRECT("C" & Row()),INDIRECT("D" & Row()))'
    try {
      const response = UrlFetchApp.fetch(url);
      if (response.getResponseCode() === 200) {
        let data = JSON.parse(response.getContentText());
        var gameTime = new Date(data['header']['competitions'][0]['date']);
        var date = Utilities.formatDate(gameTime, TIMEZONE, "MM/dd/yyyy");
        let time = Utilities.formatDate(gameTime, TIMEZONE, "hh:mm a");
        var gameStatus = data['header']['competitions'][0]['status']["type"]['shortDetail'];
        var gameState = data['header']['competitions'][0]['status']["type"]['state'];
        for (let x = 0; x < 2; x++) {
          let teamStats = data['boxscore'];
          if (teamStats.hasOwnProperty('players')) {  // Check if 'athletes' exists
            let roster = teamStats['players'][x]['statistics'][0]['athletes'];
            for (let j = 0; j < roster.length; j++) {
              let playerStats = [gameNumber,date,time,gameStatus];
              let player = roster[j];
              let playerId = player['athlete']['id'];
              let playerName = playersNames[playerId] || `Player_${playerId}`;
              
              
              if (allPlayers.includes(Number(playerId))) {
                playerStats.push(playerId);

                let stats = player['stats'];
                playerStats.push(playerName,concatFormula,gameState);
                if (stats.length === 0) {
                  playerStats.push(0); 
                } else {
                  playerStats.push(stats[1]);
                }
                playerStats.push(statusFormula);
                newRows.push(playerStats);
                
              }
            }
           } else {
            // console.log(`Game Has not started ${gameNumber}`);
            let teamNumber = data['boxscore']['teams'][x]['team']['id'];
            if (teamIDs.includes(Number(teamNumber))){
              let roster = teamLineps[teamNumber];
              for (let j = 0; j < roster.length; j++) {
                let playerId = roster[j];
                let playerStats = [gameNumber,date,time,gameStatus];
                let playerName = playersNames[playerId] || `Player_${playerId}`;

                playerStats.push(playerId,playerName,concatFormula,gameState);
                playerStats.push(0);
                playerStats.push(statusFormula);
                newRows.push(playerStats);               
              }
            }
          }
        }
      }
    } catch (e) {
      console.log(`Error processing game ID ${gameNumber}: ${e}`);
      continue;
    }

    Utilities.sleep(100); // Optional delay to prevent rate limiting
  }
  gameStatsSheet.clearContents()
  // Write all collected rows to the sheet in one batch
  if (newRows.length > 0) {
    gameStatsSheet
      .getRange(1, 1, newRows.length, newRows[0].length)
      .setValues(newRows);
  }
}

function weekSchedule(){
  const schedule = [['Game Date', 'Game Time', 'Game ID', 'Home Team ID', 'Home Team Name', 'Away Team ID', 'Away Team Name', 'Neutral Site']];

  let dates = scoreboard.getRange(1,6,2).getValues();
  console.log(dates);
  let weekStartDate = new Date(dates[0][0]);
  weekStartDate.setDate(weekStartDate.getDate()-1)
  let weekEndDate = new Date(dates[1][0]);
  weekEndDate.setDate(weekEndDate.getDate() + 1); 
  let availableDates = []; 
  let numberOfDays = Math.floor(Math.abs(weekEndDate - weekStartDate) / (1000 * 60 * 60 * 24)); 
  for (let i = 0; i < numberOfDays; i++) {
     let availableDate = Utilities.formatDate(new Date(weekStartDate.getTime() + (1000 * 60 * 60 * 24) * i),gmtTimezone, 'MM/dd/yyyy'); 
     availableDates.push(availableDate); 
     } 

  const rowDate = mainSchedule.getRange(2,1,mainSchedule.getLastRow()-1).getValues();
  const dateRows = {};

  // adjusts the sheet to keep the correct eastern timing for the processing
  rowDate.forEach((cell, index) => {
    const cellDate = Utilities.formatDate(new Date(cell[0]), gmtTimezone, 'MM/dd/yyyy');
    if (cellDate) {
      const formattedDate = Utilities.formatDate(new Date(cellDate), gmtTimezone, 'MM/dd/yyyy');// Parse it back to a Date object
      dateRows[formattedDate] = index+2; // Adjust for row offset
    }
  });

  // Get the rows that need to be pulled from the schedule 
  let minRow = Infinity;
  let maxRow = 0;
  for(let i = 0; i < availableDates.length; i++){
    let row = dateRows[availableDates[i]] || minRow;
    minRow = Math.min(row,minRow);
    maxRow = Math.max(row,maxRow);
  }
  minRow += 1;
  console.log(minRow)
  let rowDifference = maxRow - minRow + 1;
  let weekGames = mainSchedule.getRange(minRow,1,rowDifference,mainSchedule.getLastColumn()).getValues();

  scheduleSheet.clearContents();
  scheduleSheet.getRange(1,1,schedule.length,schedule[0].length).setValues(schedule);
  scheduleSheet.getRange(2,1,weekGames.length,weekGames[0].length).setValues(weekGames);

  gameStats();
  writeTimestamp();
}


// Testing functions in this area
function constantGameStats(){
 let gatheredStats = gameStatsSheet.getRange(1,1,gameStatsSheet.getLastRow(),gameStatsSheet.getLastColumn()).getValues();
 let newRows = [];
 newRows.push(gatheredStats[0]);
 let ranGames = [];
 for(let i = 1; i < gatheredStats.length; i++){
  let gameStatus = gatheredStats[i][7]
  let gameID = gatheredStats[i][0];
  if (gameStatus === 'post'){
    newRows.push(gatheredStats[i])
  }else if(gameStatus === 'in'){
    if(ranGames.includes(gameID)){
      continue
    }else {
      playerStats = gameData(gameID);
      for(let j = 0; j < playerStats.length; j++){
        newRows.push(playerStats[j]);
      }
      ranGames.push(gameID);
    }
  }else{
    let date1 = new Date(gatheredStats[i][1]);
    let date2 = new Date(gatheredStats[i][2]);
    let gameDateInMS = date1.getTime() + date2.getTime() + 2209143600000;
    if(now > gameDateInMS && now < (gameDateInMS+7200000)){
      if(ranGames.includes(gameID)){
        continue
      }else {
        playerStats = gameData(gameID);
        for(let j = 0; j < playerStats.length; j++){
          newRows.push(playerStats[j]);
        }
        ranGames.push(gameID);
      }
    }else{
      newRows.push(gatheredStats[i])
    }
  }
 }
  gameStatsSheet.clearContents()
   if (newRows.length > 0) {
    gameStatsSheet
      .getRange(1, 1, newRows.length, newRows[0].length)
      .setValues(newRows);
  }
}

function gameData(gameNumber){
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${gameNumber}`;
  let newRows = [];
  let concatFormula = '=CONCATENATE(INDIRECT("E" & Row()),"_",INDIRECT("B" & Row()))';
  let statusFormula = '=IF(INDIRECT("H" & Row())="pre",INDIRECT("C" & Row()),INDIRECT("D" & Row()))'
  try {
    const response = UrlFetchApp.fetch(url);
    if (response.getResponseCode() === 200) {
      let data = JSON.parse(response.getContentText());
      var gameTime = new Date(data['header']['competitions'][0]['date']);
      var date = Utilities.formatDate(gameTime, TIMEZONE, "MM/dd/yyyy");
      let time = Utilities.formatDate(gameTime, TIMEZONE, "hh:mm a");
      var gameStatus = data['header']['competitions'][0]['status']["type"]['shortDetail'];
      var gameState = data['header']['competitions'][0]['status']["type"]['state'];
      for (let x = 0; x < 2; x++) {
        let teamStats = data['boxscore'];
        if (teamStats.hasOwnProperty('players')) {  // Check if 'athletes' exists
          let roster = teamStats['players'][x]['statistics'][0]['athletes'];
          for (let j = 0; j < roster.length; j++) {
            let playerStats = [gameNumber,date,time,gameStatus];
            let player = roster[j];
            let playerId = player['athlete']['id'];
            let playerName = playersNames[playerId] || `Player_${playerId}`;
            
            
            if (allPlayers.includes(Number(playerId))) {
              playerStats.push(playerId);

              let stats = player['stats'];
              playerStats.push(playerName,concatFormula,gameState);
              if (stats.length === 0) {
                playerStats.push(0); 
              } else {
                // console.log(stats);
                playerStats.push(stats[1]);
              }
              playerStats.push(statusFormula);
              newRows.push(playerStats);
              
            }
          }
          } else {
          // console.log(`Game Has not started ${gameNumber}`);
          let teamNumber = data['boxscore']['teams'][x]['team']['id'];
          if (teamIDs.includes(Number(teamNumber))){
            let roster = teamLineps[teamNumber];
            for (let j = 0; j < roster.length; j++) {
              let playerId = roster[j];
              let playerStats = [gameNumber,date,time,gameStatus];
              let playerName = playersNames[playerId] || `Player_${playerId}`;

              playerStats.push(playerId,playerName,concatFormula,gameState);
              playerStats.push("");
              playerStats.push(statusFormula);
              newRows.push(playerStats);               
            }
          }
        }
      }
    }
  } catch (e) {
    console.log(`Error processing game ID ${gameNumber}: ${e}`);
  }
  return newRows
}

function gameDataGPT(gameNumber) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${gameNumber}`;

  let newRows = [];
  let concatFormula = '=CONCATENATE(INDIRECT("E" & ROW()),"_",INDIRECT("B" & ROW()))';
  let statusFormula = '=IF(INDIRECT("H" & ROW())="pre",INDIRECT("C" & ROW()),INDIRECT("D" & ROW()))';

  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

    if (response.getResponseCode() !== 200) {
      throw new Error(`HTTP ${response.getResponseCode()}`);
    }

    const data = JSON.parse(response.getContentText());

    const gameTime = new Date(data.header.competitions[0].date);
    const date = Utilities.formatDate(gameTime, TIMEZONE, "MM/dd/yyyy");
    const time = Utilities.formatDate(gameTime, TIMEZONE, "hh:mm a");
    const gameStatus = data.header.competitions[0].status.type.shortDetail;
    const gameState = data.header.competitions[0].status.type.state;

    for (let x = 0; x < 2; x++) {
      const boxscore = data.boxscore;

      // GAME HAS STATS
      if (boxscore.players) {
        const roster = boxscore.players[x].statistics[0].athletes;

        for (let j = 0; j < roster.length; j++) {
          const player = roster[j];
          const playerId = Number(player.athlete.id);

          if (!allPlayers.includes(playerId)) continue;

          const playerName = playersNames[playerId] || `Player_${playerId}`;
          const stats = player.stats;

          newRows.push([
            gameNumber,
            date,
            time,
            gameStatus,
            playerId,
            playerName,
            concatFormula,
            gameState,
            stats.length ? stats[1] : 0,
            statusFormula
          ]);
        }

      // GAME NOT STARTED
      } else {
        const teamId = Number(boxscore.teams[x].team.id);

        if (!teamIDs.includes(teamId)) continue;

        const roster = teamLineps[teamId];

        for (let j = 0; j < roster.length; j++) {
          const playerId = roster[j];
          const playerName = playersNames[playerId] || `Player_${playerId}`;

          newRows.push([
            gameNumber,
            date,
            time,
            gameStatus,
            playerId,
            playerName,
            concatFormula,
            gameState,
            "",
            statusFormula
          ]);
        }
      }
    }

    return {
      success: true,
      rows: newRows
    };

  } catch (err) {
    return {
      success: false,
      rows: [],
      error: `Game ${gameNumber}: ${err.message}`
    };
  }
}

function constantGameStatsGPT() {
  const gatheredStats = gameStatsSheet
    .getRange(1, 1, gameStatsSheet.getLastRow(), gameStatsSheet.getLastColumn())
    .getValues();

  let newRows = [];
  let ranGames = [];
  let errorGames = [];

  // Header
  newRows.push(gatheredStats[0]);

  // Pre-index old rows by gameID (FAST + CLEAN)
  let oldRowsByGame = {};
  for (let i = 1; i < gatheredStats.length; i++) {
    const gameID = gatheredStats[i][0];
    if (!oldRowsByGame[gameID]) oldRowsByGame[gameID] = [];
    oldRowsByGame[gameID].push(gatheredStats[i]);
  }

  for (let i = 1; i < gatheredStats.length; i++) {
    const row = gatheredStats[i];
    const gameID = row[0];
    const gameStatus = row[7];

    if (ranGames.includes(gameID)) continue;

    let shouldUpdate = false;

    if (gameStatus === "post") {
      newRows.push(row);
      continue;
    }

    if (gameStatus === "in") {
      shouldUpdate = true;
    } else {
      const date1 = new Date(row[1]);
      const date2 = new Date(row[2]);
      const gameTimeMS =
        date1.getTime() + date2.getTime() + 2209143600000;

      if (now > gameTimeMS && now < gameTimeMS + 7200000) {
        shouldUpdate = true;
      }
    }

    if (!shouldUpdate) {
      newRows.push(row);
      continue;
    }

    const result = gameDataGPT(gameID);

    if (result.success) {
      newRows.push(...result.rows);
    } else {
      errorGames.push(gameID);

      if (oldRowsByGame[gameID]) {
        newRows.push(...oldRowsByGame[gameID]);
      }
    }

    ranGames.push(gameID);
  }

  gameStatsSheet.clearContents();

  if (newRows.length) {
    gameStatsSheet
      .getRange(1, 1, newRows.length, newRows[0].length)
      .setValues(newRows);
  }

  if (errorGames.length) {
    Logger.log(`Games failed this run: ${errorGames.join(", ")}`);
  }
}

