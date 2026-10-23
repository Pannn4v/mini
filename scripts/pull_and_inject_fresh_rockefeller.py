#!/usr/bin/env python3
import os
import sys
import gzip
import csv
import json
import urllib.request
from datetime import datetime

MINI_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(MINI_DIR, "data")
ENV_FILE = os.path.join(MINI_DIR, ".env.local")

SKILL_DATA_DIR = r"C:\Users\LENOVO\.agents\skills\oilmarketrockefeller\data"
COMPANIES_FILE = os.path.join(SKILL_DATA_DIR, "companies.csv.gz")
CREWS_FILE = os.path.join(SKILL_DATA_DIR, "crews.csv.gz")

# 1. Parse env
env = {}
with open(ENV_FILE, "r", encoding="utf-8") as f:
    for line in f:
        parts = line.strip().split("=")
        if len(parts) >= 2:
            env[parts[0].strip()] = "=".join(parts[1:]).strip()

supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")

if not supabase_url or not supabase_key:
    print("[Error] Missing Supabase credentials")
    sys.exit(1)

# 2. Fetch existing emails from Supabase
def get_existing_emails():
    req = urllib.request.Request(
        f"{supabase_url}/rest/v1/leads?select=recipient_email",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}"
        }
    )
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode())
        return set(row["recipient_email"].lower().strip() for row in data if row.get("recipient_email"))

def generate_supply_copy(row):
    contact = row.get("contact") or row.get("greeting") or "Sir"
    parts = contact.strip().split()
    salutation = f"Mr. {parts[-1]}" if len(parts) >= 2 else contact

    city = row.get("city") or row.get("state") or "the basin"
    trucks = row.get("trucks") or "commercial"

    subject = f"{trucks} units in {city} / fleet availability"
    body = (
        f"{salutation},\n\n"
        f"Noted your {trucks} transport units registered in {city}.\n\n"
        f"Prior to routing upcoming Uinta Basin crude movements to regional haulers, we require current availability for your fleet over the next 30 days.\n\n"
        f"Are your units fully committed, or is open capacity available from your yard?\n\n"
        f"Pandu Utama"
    )
    return subject, body

def generate_demand_copy(row):
    contact = row.get("contact") or row.get("greeting") or "Sir"
    parts = contact.strip().split()
    salutation = f"Mr. {parts[-1]}" if len(parts) >= 2 else contact

    state = row.get("state") or "the basin"

    subject = f"crude haulage / Uinta Basin standby capacity"
    body = (
        f"{salutation},\n\n"
        f"Given transport constraints on waxy crude across the Uinta corridor, field schedules remain contingent on dedicated truck availability.\n\n"
        f"We track local insulated hauling units currently idle in the Vernal and Roosevelt yards.\n\n"
        f"Should your upcoming pad production encounter transport bottlenecks or contractor delays, reply with your required barrels-per-day capacity.\n\n"
        f"Pandu Utama"
    )
    return subject, body

def main():
    print("=== EXTRACTING 45 FRESH SUPPLY & 55 FRESH DEMAND (ROCKEFELLER COPY) ===")
    existing_emails = get_existing_emails()
    print(f"Existing Supabase emails to skip: {len(existing_emails)}")

    # 3. Pull 45 fresh crews
    fresh_crews = []
    with gzip.open(CREWS_FILE, "rt", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            email = (row.get("email") or "").strip().lower()
            if not email or "@" not in email:
                continue
            if email in existing_emails:
                continue
            
            subject, body = generate_supply_copy(row)
            row["subject"] = subject
            row["body"] = body
            fresh_crews.append(row)
            existing_emails.add(email)

            if len(fresh_crews) >= 45:
                break

    # 4. Pull 55 fresh companies
    fresh_companies = []
    with gzip.open(COMPANIES_FILE, "rt", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            email = (row.get("email") or "").strip().lower()
            if not email or "@" not in email:
                continue
            if email in existing_emails:
                continue

            subject, body = generate_demand_copy(row)
            row["subject"] = subject
            row["body"] = body
            fresh_companies.append(row)
            existing_emails.add(email)

            if len(fresh_companies) >= 55:
                break

    print(f"[+] Extracted fresh unique: {len(fresh_crews)} Supply and {len(fresh_companies)} Demand.")

    # 5. Format for Supabase injection
    now = datetime.utcnow()
    # Next window 11:00 UTC (19:00 WITA)
    base_window = datetime(now.year, now.month, now.day, 11, 0, 0)
    base_time_epoch = base_window.timestamp()
    if base_time_epoch < now.timestamp():
        base_time_epoch = now.timestamp() + 300

    supply_payload = []
    for idx, r in enumerate(fresh_crews):
        sched_time = datetime.utcfromtimestamp(base_time_epoch + idx * 300).isoformat() + "Z"
        supply_payload.append({
            "id": f"lead_{int(now.timestamp())}_rks_{idx}_{os.urandom(2).hex()}",
            "campaign_id": "camp_1792481395570_qjbo",
            "recipient_email": r["email"],
            "recipient_name": r.get("contact") or r.get("greeting") or "Partner",
            "company_name": r.get("company") or "Oilfield Services",
            "city": r.get("city") or r.get("state") or "Vernal",
            "subject_template": r["subject"],
            "body_template": r["body"],
            "status": "PENDING",
            "scheduled_at": sched_time,
            "created_at": datetime.utcnow().isoformat() + "Z"
        })

    demand_payload = []
    for idx, r in enumerate(fresh_companies):
        sched_time = datetime.utcfromtimestamp(base_time_epoch + idx * 240).isoformat() + "Z"
        demand_payload.append({
            "id": f"lead_{int(now.timestamp())}_rkd_{idx}_{os.urandom(2).hex()}",
            "campaign_id": "camp_1792481404891_wyf9",
            "recipient_email": r["email"],
            "recipient_name": r.get("contact") or r.get("greeting") or "Operator",
            "company_name": r.get("company") or "Exploration & Production",
            "city": r.get("state") or "UT",
            "subject_template": r["subject"],
            "body_template": r["body"],
            "status": "PENDING",
            "scheduled_at": sched_time,
            "created_at": datetime.utcnow().isoformat() + "Z"
        })

    # 6. Post to Supabase in chunks
    def insert_chunks(items, label):
        chunk_size = 25
        for i in range(0, len(items), chunk_size):
            chunk = items[i:i + chunk_size]
            req = urllib.request.Request(
                f"{supabase_url}/rest/v1/leads",
                data=json.dumps(chunk).encode("utf-8"),
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation"
                },
                method="POST"
            )
            try:
                with urllib.request.urlopen(req) as res:
                    print(f"[+] Injected {len(chunk)} {label} leads (Chunk {i//chunk_size + 1})")
            except Exception as e:
                print(f"[-] Error injecting chunk {label}: {e}")

    insert_chunks(supply_payload, "Supply Oil")
    insert_chunks(demand_payload, "Demand Oil")

    # 7. Update local store.json
    store_file = os.path.join(DATA_DIR, "store.json")
    if os.path.exists(store_file):
        try:
            with open(store_file, "r", encoding="utf-8") as f:
                store = json.load(f)
            store.setdefault("leads", []).extend(supply_payload + demand_payload)
            with open(store_file, "w", encoding="utf-8") as f:
                json.dump(store, f, indent=2)
            print(f"[+] Synced {len(supply_payload) + len(demand_payload)} leads to local store.json")
        except Exception as e:
            print(f"[-] store.json sync warning: {e}")

    print("\n=== COMPLETE ===")
    print(f"Successfully added {len(supply_payload)} PENDING Supply leads into 'Supply oil' (camp_1792481395570_qjbo)")
    print(f"Successfully added {len(demand_payload)} PENDING Demand leads into 'Demand Oil' (camp_1792481404891_wyf9)")
    print("Zero duplicates. Rockefeller standard copy applied.")

if __name__ == "__main__":
    main()
