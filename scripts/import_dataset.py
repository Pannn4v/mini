import json
import csv
import sys
import os

def import_to_sequencer(file_path, campaign_id="default-campaign"):
    store_file = os.path.join(os.path.dirname(__file__), "..", "data", "store.json")
    if not os.path.exists(store_file):
        print(f"[!] Database store.json not found. Run dev server first.")
        return

    with open(store_file, "r", encoding="utf-8") as f:
        db = json.load(f)

    new_leads = []
    
    if file_path.endswith(".json"):
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            for idx, item in enumerate(data):
                name = item.get("contact_name") or item.get("name") or "there"
                email = (item.get("email") or "").strip().lower()
                company = item.get("company_name") or item.get("company") or ""
                city = item.get("city") or ""
                
                if not email:
                    continue
                    
                new_leads.append({
                    "id": f"lead_{Date.now() if 'Date' in locals() else 'import'}_{idx}",
                    "campaign_id": campaign_id,
                    "recipient_email": email,
                    "recipient_name": name,
                    "company_name": company,
                    "city": city,
                    "subject_template": "{volusia charter rfp / cabling scope|central fl charter rfp / crew availability|quick question regarding volusia campus rfp}",
                    "body_template": "{Hi|Hey|Good morning} {first_name},\n\nReaching out directly to {company_name} regarding the Category 2 low-voltage scope for Burns Science & Technology Charter in Volusia County.\n\nOpen to reviewing the BoQ before bidding locks?\n\nBest,\nPandu",
                    "status": "PENDING",
                    "scheduled_at": "2026-10-14T12:00:00.000Z", # Wednesday default
                    "created_at": "2026-10-12T19:25:00.000Z"
                })
    elif file_path.endswith(".csv"):
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            reader = csv.DictReader(f)
            for idx, row in enumerate(reader):
                email = ""
                name = ""
                company = ""
                city = ""
                
                for k, v in row.items():
                    kl = k.lower()
                    if "email" in kl and v:
                        email = v.strip().lower()
                    elif ("name" in kl or "contact" in kl or "owner" in kl) and not email:
                        name = v.strip()
                    elif ("company" in kl or "contractor" in kl or "airport" in kl) and v:
                        company = v.strip()
                    elif "city" in kl and v:
                        city = v.strip()
                        
                if not email:
                    continue
                    
                new_leads.append({
                    "id": f"lead_csv_{idx}_{os.urandom(2).hex()}",
                    "campaign_id": campaign_id,
                    "recipient_email": email,
                    "recipient_name": name or "there",
                    "company_name": company,
                    "city": city,
                    "subject_template": row.get("subject") or "quick question regarding project",
                    "body_template": row.get("p1") or "Hi,\n\nReaching out regarding upcoming projects.",
                    "status": "PENDING",
                    "scheduled_at": "2026-10-14T12:00:00.000Z",
                    "created_at": "2026-10-12T19:25:00.000Z"
                })

    db["leads"].extend(new_leads)
    with open(store_file, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2)

    print(f"[+] Successfully ingested {len(new_leads)} leads into campaign '{campaign_id}' in Mini-Instantly database!")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        import_to_sequencer(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "default-campaign")
    else:
        print("Usage: python import_dataset.py <path_to_csv_or_json> [campaign_id]")
