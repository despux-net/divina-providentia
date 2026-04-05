import pandas as pd
import json
import os

url = 'https://www.matteoiacoviello.com/gpr_files/data_gpr_export.xls'
print("Downloading GPR Excel file...")
df = pd.read_excel(url)
print("Downloaded, processing...")

# Limit to last 12 months
df = df.tail(12)

# Ensure year/month is extracted 
months = df['month'].astype(str).tolist()

data = {
    'Months': [m[:7] for m in months], # YYYY-MM
    'Global': df['GPR'].astype(float).tolist()
}

for col in df.columns:
    if col.startswith('GPRC_'):
        country_code = col.replace('GPRC_', '')
        data[country_code] = df[col].astype(float).tolist()

output_path = 'gpr_data.json'
with open(output_path, 'w') as f:
    json.dump(data, f)
print(f"Generated {output_path} successfully!")
