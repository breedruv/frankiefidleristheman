import csv
from datetime import datetime
from pathlib import Path

from game_information import PLAYER_STATS_FIELDS


ML_FEATURE_FIELDS = ["Games Played"] + [f"AVG_{field}" for field in PLAYER_STATS_FIELDS]
ML_DATASET_HEADER = [
    "Date",
    "Game ID",
    "Player ID",
    "Player Name",
    "TEAM ID",
    "Team Name",
    "Target PTS",
    *ML_FEATURE_FIELDS,
]


def _to_float(value):
    try:
        return float(value)
    except Exception:
        return 0.0


def _safe_div(numerator, denominator):
    return numerator / denominator if denominator else 0.0


def build_player_pts_dataset(
    player_stats_file,
    output_file,
    min_minutes=5,
    min_games=3,
):
    stats_path = Path(player_stats_file)
    if not stats_path.exists() or stats_path.stat().st_size == 0:
        print(f"No player stats found at {player_stats_file}")
        return []

    rows = []
    with stats_path.open("r", newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        for row in reader:
            date_text = row.get("Date", "")
            player_id = row.get("Player ID", "")
            if not date_text or not player_id:
                continue
            try:
                date_obj = datetime.strptime(date_text, "%m/%d/%y").date()
            except Exception:
                continue
            rows.append((player_id, date_obj, row.get("Game ID", ""), row))

    rows.sort(key=lambda item: (item[0], item[1], item[2]))

    output_path = Path(output_file)
    if output_path.exists():
        output_path.unlink()

    samples = []
    with open(output_file, "w", newline="", encoding="utf-8") as out_file:
        writer = csv.writer(out_file)
        writer.writerow(ML_DATASET_HEADER)

        totals_by_player = {}
        games_by_player = {}

        for player_id, _date, _game_id, row in rows:
            totals = totals_by_player.setdefault(
                player_id, {field: 0.0 for field in PLAYER_STATS_FIELDS}
            )
            games_played = games_by_player.get(player_id, 0)

            minutes = _to_float(row.get("MIN", 0))
            if games_played >= min_games and minutes >= min_minutes:
                averages = [
                    _safe_div(totals[field], games_played)
                    for field in PLAYER_STATS_FIELDS
                ]
                feature_row = [games_played] + averages
                target_pts = _to_float(row.get("PTS", 0))
                dataset_row = [
                    row.get("Date", ""),
                    row.get("Game ID", ""),
                    row.get("Player ID", ""),
                    row.get("Player Name", ""),
                    row.get("TEAM ID", ""),
                    row.get("Team Name", ""),
                    target_pts,
                    *feature_row,
                ]
                writer.writerow(dataset_row)
                samples.append(
                    {
                        "date": _date,
                        "meta": dataset_row[:7],
                        "features": feature_row,
                        "target": target_pts,
                    }
                )

            for field in PLAYER_STATS_FIELDS:
                totals[field] += _to_float(row.get(field, 0))
            games_by_player[player_id] = games_played + 1

    print(f"Wrote {len(samples)} ML rows to {output_file}")
    return samples


def train_player_pts_model(
    player_stats_file,
    dataset_file,
    model_file,
    predictions_file,
    min_minutes=5,
    min_games=3,
    test_ratio=0.2,
    recency_half_life_days=365,
):
    try:
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler
        from sklearn.linear_model import Ridge
        from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
        import joblib
    except ImportError:
        print("scikit-learn is required. Run: python -m pip install scikit-learn")
        return None

    samples = build_player_pts_dataset(
        player_stats_file,
        dataset_file,
        min_minutes=min_minutes,
        min_games=min_games,
    )
    if not samples:
        return None

    samples.sort(key=lambda item: item["date"])
    total = len(samples)
    split_idx = int(total * (1 - test_ratio))
    split_idx = max(1, min(split_idx, total - 1))

    train_samples = samples[:split_idx]
    test_samples = samples[split_idx:]

    x_train = [s["features"] for s in train_samples]
    y_train = [s["target"] for s in train_samples]
    x_test = [s["features"] for s in test_samples]
    y_test = [s["target"] for s in test_samples]

    sample_weights = None
    if recency_half_life_days and recency_half_life_days > 0:
        max_date = max(s["date"] for s in train_samples)
        sample_weights = [
            0.5 ** ((max_date - s["date"]).days / recency_half_life_days)
            for s in train_samples
        ]
        print(
            "Using recency weighting with half-life "
            f"{recency_half_life_days} days."
        )

    model = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("ridge", Ridge(alpha=1.0)),
        ]
    )
    if sample_weights is None:
        model.fit(x_train, y_train)
    else:
        model.fit(x_train, y_train, ridge__sample_weight=sample_weights)
    preds = model.predict(x_test)

    mae = mean_absolute_error(y_test, preds)
    rmse = mean_squared_error(y_test, preds, squared=False)
    r2 = r2_score(y_test, preds)

    joblib.dump(model, model_file)
    print(f"Saved model to {model_file}")
    print(
        f"Test metrics: MAE {mae:.2f}, RMSE {rmse:.2f}, R2 {r2:.3f} "
        f"(test samples {len(y_test)})"
    )

    yearly_actuals = {}
    yearly_preds = {}
    for sample, pred in zip(test_samples, preds):
        year = sample["date"].year
        yearly_actuals.setdefault(year, []).append(sample["target"])
        yearly_preds.setdefault(year, []).append(pred)
    if len(yearly_actuals) > 1:
        print("Test metrics by year:")
        for year in sorted(yearly_actuals):
            year_actuals = yearly_actuals[year]
            year_preds = yearly_preds[year]
            year_mae = mean_absolute_error(year_actuals, year_preds)
            year_rmse = mean_squared_error(
                year_actuals, year_preds, squared=False
            )
            year_r2 = r2_score(year_actuals, year_preds)
            print(
                f"  {year}: MAE {year_mae:.2f}, RMSE {year_rmse:.2f}, R2 {year_r2:.3f} "
                f"(n={len(year_actuals)})"
            )

    with open(predictions_file, "w", newline="", encoding="utf-8") as out_file:
        writer = csv.writer(out_file)
        writer.writerow(
            [
                "Date",
                "Game ID",
                "Player ID",
                "Player Name",
                "TEAM ID",
                "Team Name",
                "Actual PTS",
                "Predicted PTS",
                "Error",
            ]
        )
        for sample, pred in zip(test_samples, preds):
            meta = sample["meta"]
            actual = sample["target"]
            error = pred - actual
            writer.writerow([*meta[:6], actual, pred, error])

    print(f"Wrote predictions to {predictions_file}")
    return {"mae": mae, "rmse": rmse, "r2": r2, "test_samples": len(y_test)}
