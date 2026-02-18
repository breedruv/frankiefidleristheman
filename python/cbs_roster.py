def team_rosterCBS(url):
    # Fetch the HTML content
    response = requests.get(url)
    html_content = response.content

    # Parse the HTML content
    soup = BeautifulSoup(html_content, 'html.parser')

    # Get all elements with the class name 'TableBase-table'
    table_elements = soup.find_all(class_='TableBase-table')

    # Initialize a list to store the text content of table rows
    table_rows_text = []

    # Iterate through each table element and extract the rows
    for table in table_elements:
        rows = table.find_all('tr')
        for row in rows:
            row_text = []
            cells = row.find_all('td')
            for cell in cells:
                cell_text = cell.get_text(strip=True)
                subnodes = cell.find_all(recursive=False)
                if subnodes:
                    for subnode in subnodes:
                        row_text.append(subnode.get_text(strip=True))
                else:
                    row_text.append(cell_text)
            table_rows_text.append(row_text)

    # Print the text content of table rows
    return table_rows_text