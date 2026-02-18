import requests
import csv
import time
import os


def get_previous_games():
    # Define the CSV filename
    filename = 'cfb_games.csv'

    # Determine the starting game ID based on the last entry in the file
    last_game = None
    if os.path.exists(filename):
        with open(filename, 'r') as file:
            reader = csv.reader(file)
            rows = list(reader)
            if len(rows) > 1:
                last_game = int(rows[-1][0])  # Last game ID in the first column

    # If no last game is found, start from a default value (replace with desired ID)
    if last_game is None:
        last_game = 10000  # Replace with a starting ID if no data exists

    # Set up CSV for appending new data
    with open(filename, 'a', newline='') as file:
        writer = csv.writer(file)

        # Write headers if the file is new
        if last_game == 10000:
            writer.writerow(['Game ID', 'Away Team', 'Away Team ID', 'Home Team', 'Home Team ID', 'Season', 'Week'])

        # Loop backwards from last game ID, retrieving data
        for i in range(last_game-1, 0, -1):
            url = f"https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event={i}"
            try:
                response = requests.get(url)

                if response.status_code == 200:
                    data = response.json()
                    awayteam = data['boxscore']['teams'][0]['team']['shortDisplayName']
                    awayteamid = data['boxscore']['teams'][0]['team']['id']
                    hometeamid = data['boxscore']['teams'][1]['team']['id']
                    hometeam = data['boxscore']['teams'][1]['team']['shortDisplayName']
                    weekdate = data['header']['week']
                    season = data['header']['season']['year']

                    print(
                        f"Game ID: {i}, Away: {awayteam} ID={awayteamid}, Home: {hometeam} ID={hometeamid}, Season: {season}, Week: {weekdate}")

                    # Write row to CSV
                    writer.writerow([i, awayteam, awayteamid, hometeam, hometeamid, season, weekdate])

                    # Stop if the season is 2023 or earlier
                    # if int(season) <= 2023:
                    #     break
            except Exception as e:
                print(f"Error processing game ID {i}: {e}")

            # Optional: Prevent rate-limiting issues
            time.sleep(0.1)  # 100 ms delay
            print(f"Tried game {i-401600000}")


# Run the function
get_previous_games()
