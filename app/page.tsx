"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Mail, 
  Send, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Pause, 
  Play, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Layers, 
  Upload, 
  Terminal,
  ShieldCheck,
  Zap,
  Download,
  ChevronDown,
  FolderPlus,
  Settings2,
  FileText,
  SlidersHorizontal,
  FileCode
} from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  market_category: string;
  status: "ACTIVE" | "PAUSED";
  timezone: string;
  window_start: string;
  window_end: string;
  min_interval_mins: number;
  max_interval_mins: number;
  subject_default?: string;
  body_default?: string;
  created_at: string;
}

interface Inbox {
  id: string;
  email: string;
  display_name: string;
  daily_limit: number;
  sent_today: number;
  last_sent_at: string;
  status: string;
}

interface Lead {
  id: string;
  campaign_id: string;
  recipient_email: string;
  recipient_name: string;
  company_name: string;
  city: string;
  subject_template: string;
  body_template: string;
  status: string;
  scheduled_at: string;
  sent_at?: string;
  last_error?: string;
}

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"campaigns" | "queue" | "sequences" | "inboxes" | "logs">("campaigns");
  const [loading, setLoading] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);

  // New Campaign Modal
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [newCampName, setNewCampName] = useState("");
  const [newCampMarket, setNewCampMarket] = useState("SCHOOL_WIFI");
  const [newCampTimezone, setNewCampTimezone] = useState("America/New_York");
  const [newCampStart, setNewCampStart] = useState("07:30");
  const [newCampEnd, setNewCampEnd] = useState("18:00");
  const [newCampSubject, setNewCampSubject] = useState("");
  const [newCampBody, setNewCampBody] = useState("");

  // New Inbox Modal
  const [showAddInbox, setShowAddInbox] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("Pandu Utama");
  const [newPassword, setNewPassword] = useState("");
  const [newDailyLimit, setNewDailyLimit] = useState(15);
  const [inboxError, setInboxError] = useState("");

  // Preset Seeding Dropdown
  const [showPresetMenu, setShowPresetMenu] = useState(false);

  // File Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sequence Edit State
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [seqSavedMessage, setSeqSavedMessage] = useState(false);

  const fetchData = async () => {
    try {
      const [cRes, iRes, lRes, logRes] = await Promise.all([
        fetch("/api/campaigns"),
        fetch("/api/inboxes"),
        fetch("/api/leads"),
        fetch("/api/logs")
      ]);

      if (cRes.ok) {
        const campList: Campaign[] = await cRes.json();
        setCampaigns(campList);
        if (!selectedCampaignId && campList.length > 0) {
          setSelectedCampaignId(campList[0].id);
        }
      }
      if (iRes.ok) setInboxes(await iRes.json());
      if (lRes.ok) setAllLeads(await lRes.json());
      if (logRes.ok) setLogs(await logRes.json());
    } catch (e) {
      console.error("Fetch error:", e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const activeCampaign = campaigns.find((c) => c.id === selectedCampaignId) || campaigns[0] || null;

  // Sync sequence editor when active campaign changes
  useEffect(() => {
    if (activeCampaign) {
      setEditSubject(activeCampaign.subject_default || "");
      setEditBody(activeCampaign.body_default || "");
    }
  }, [selectedCampaignId, campaigns]);

  // Filter leads based on selected campaign (or all)
  const currentLeads = selectedCampaignId && selectedCampaignId !== "all"
    ? allLeads.filter((l) => l.campaign_id === selectedCampaignId)
    : allLeads;

  const toggleCampaignStatus = async (campId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    await fetch("/api/campaigns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: campId, status: nextStatus }),
    });
    fetchData();
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampName) return;
    setLoading(true);

    try {
      let defaultSub = newCampSubject;
      let defaultBod = newCampBody;

      if (!defaultSub) {
        if (newCampMarket === "SCHOOL_WIFI") {
          defaultSub = "{central fl charter rfp / cabling scope|volusia charter school tender} / crew availability";
          defaultBod = "{Hi|Hey|Good morning} {first_name},\n\nReaching out directly to {company_name} regarding the Category 2 low-voltage cabling scope for Burns Science & Technology Charter School in Volusia County.\n\nThe deployment calls for Cat6A plenum drops, patch panels, 24/48-port PoE switching, and indoor/outdoor Access Point mounting (~90 AP units across the campus).\n\nAre you open to reviewing the spec sheet and BoQ before bidding locks?\n\nBest,\nPandu";
        } else if (newCampMarket === "AIRPORT_PAVING") {
          defaultSub = "airport work in {city} / paving contractor availability";
          defaultBod = "{Hi|Hey|Good morning} {first_name},\n\nI have municipal airports in {city} with open FAA AIP runway & taxiway rehabilitation work looking for qualified paving contractors before the letting.\n\nDo you have asphalt/paving crew capacity for airport jobs?\n\nBest,\nPandu";
        } else {
          defaultSub = "Partnership inquiry regarding {company_name}";
          defaultBod = "Hi {first_name},\n\nHope you're having a great week at {company_name}.\n\nBest,\nPandu";
        }
      }

      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCampName,
          market_category: newCampMarket,
          timezone: newCampTimezone,
          window_start: newCampStart,
          window_end: newCampEnd,
          subject_default: defaultSub,
          body_default: defaultBod,
        }),
      });

      if (res.ok) {
        const created: Campaign = await res.json();
        setShowCreateCampaign(false);
        setNewCampName("");
        setSelectedCampaignId(created.id);
        setActiveTab("queue");
        fetchData();
      }
    } catch (err: any) {
      alert("Error creating campaign: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCampaign = async (campId: string) => {
    if (!confirm("Are you sure you want to delete this campaign and all its leads?")) return;
    await fetch(`/api/campaigns?id=${campId}`, { method: "DELETE" });
    if (selectedCampaignId === campId) {
      setSelectedCampaignId("");
    }
    fetchData();
  };

  const handleSaveSequence = async () => {
    if (!activeCampaign) return;
    setLoading(true);
    try {
      await fetch("/api/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeCampaign.id,
          subject_default: editSubject,
          body_default: editBody,
        }),
      });
      setSeqSavedMessage(true);
      setTimeout(() => setSeqSavedMessage(false), 2500);
      fetchData();
    } catch (e: any) {
      alert("Failed to save sequence: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedPreset = async (presetType: "school_30" | "airport_35" | "school_followup_40") => {
    if (!activeCampaign) {
      alert("Please select or create a campaign first.");
      return;
    }
    setShowPresetMenu(false);
    setLoading(true);

    try {
      const pRes = await fetch(`/api/presets?preset=${presetType}&campaign_id=${activeCampaign.id}`);
      if (!pRes.ok) throw new Error("Preset fetch failed");
      const pData = await pRes.json();

      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: pData.leads }),
      });

      fetchData();
    } catch (e: any) {
      alert("Error seeding preset: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCampaign) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error("Uploaded JSON must be an array of objects.");

        const formattedLeads = parsed.map((item: any, idx: number) => ({
          campaign_id: activeCampaign.id,
          recipient_name: item.contact_name || item.name || item.contact || "Partner",
          recipient_email: item.email,
          company_name: item.company_name || item.company || "Company",
          city: item.city || "Florida",
          subject_template: item.subject_template || item.subject || activeCampaign.subject_default || "Inquiry",
          body_template: item.body_template || item.body || activeCampaign.body_default || "Hello",
          status: "PENDING",
          scheduled_at: new Date(Date.now() + idx * 5 * 60 * 1000).toISOString(),
        }));

        await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leads: formattedLeads }),
        });

        alert(`Successfully imported ${formattedLeads.length} leads into ${activeCampaign.name}`);
        fetchData();
      } catch (err: any) {
        alert("JSON parse error: " + err.message);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClearCurrentQueue = async () => {
    const campName = activeCampaign ? activeCampaign.name : "all campaigns";
    if (!confirm(`Clear leads for ${campName}?`)) return;
    await fetch(`/api/leads?campaign_id=${activeCampaign ? activeCampaign.id : "all"}`, { method: "DELETE" });
    fetchData();
  };

  const exportToJson = () => {
    if (currentLeads.length === 0) return alert("Queue is empty. No leads to export.");
    const blob = new Blob([JSON.stringify(currentLeads, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeCampaign ? activeCampaign.name.toLowerCase().replace(/[^a-z0-9]/g, "_") : "leads"}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportToCsv = () => {
    if (currentLeads.length === 0) return alert("Queue is empty. No leads to export.");
    const headers = [
      "id",
      "campaign_id",
      "recipient_name",
      "recipient_email",
      "company_name",
      "city",
      "status",
      "scheduled_at",
      "sent_at",
      "subject_template",
      "body_template",
      "last_error"
    ];
    
    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = currentLeads.map((lead) => [
      escapeCsv(lead.id),
      escapeCsv(lead.campaign_id),
      escapeCsv(lead.recipient_name),
      escapeCsv(lead.recipient_email),
      escapeCsv(lead.company_name),
      escapeCsv(lead.city),
      escapeCsv(lead.status),
      escapeCsv(lead.scheduled_at),
      escapeCsv(lead.sent_at || ""),
      escapeCsv(lead.subject_template),
      escapeCsv(lead.body_template),
      escapeCsv(lead.last_error || "")
    ].join(","));

    const csvContent = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeCampaign ? activeCampaign.name.toLowerCase().replace(/[^a-z0-9]/g, "_") : "leads"}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const triggerDispatch = async (force = false) => {
    setLoading(true);
    setDispatchStatus("Triggering dispatch...");
    try {
      const campParam = activeCampaign ? `&campaign_id=${activeCampaign.id}` : "";
      const res = await fetch(`/api/cron/dispatch?${force ? "force=true" : ""}${campParam}`);
      const data = await res.json();
      setDispatchStatus(`[${data.status}] ${data.message || (data.success ? `Sent to ${data.lead} via ${data.inbox}` : data.error)}`);
      fetchData();
    } catch (err: any) {
      setDispatchStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddInbox = async (e: React.FormEvent) => {
    e.preventDefault();
    setInboxError("");
    setLoading(true);

    try {
      const res = await fetch("/api/inboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          display_name: newDisplayName,
          app_password: newPassword,
          daily_limit: newDailyLimit,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setInboxError(data.error || "Failed to authenticate with Google SMTP.");
      } else {
        setShowAddInbox(false);
        setNewEmail("");
        setNewPassword("");
        fetchData();
      }
    } catch (err: any) {
      setInboxError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInbox = async (id: string) => {
    if (!confirm("Are you sure you want to remove this inbox?")) return;
    await fetch(`/api/inboxes?id=${id}`, { method: "DELETE" });
    fetchData();
  };

  // Metrics
  const totalLeads = currentLeads.length;
  const sentCount = currentLeads.filter((l) => l.status === "SENT").length;
  const pendingCount = currentLeads.filter((l) => l.status === "PENDING").length;
  const failedCount = currentLeads.filter((l) => l.status === "FAILED").length;
  const activeInboxes = inboxes.filter((i) => i.status === "ACTIVE").length;
  const totalDailyCapacity = inboxes.reduce((acc, curr) => acc + curr.daily_limit, 0);
  const totalSentToday = inboxes.reduce((acc, curr) => acc + curr.sent_today, 0);
  const nextDue = currentLeads.find((l) => l.status === "PENDING");

  return (
    <div className="min-h-screen bg-black text-[#EDEDED] flex flex-col font-sans">
      {/* Top Monochrome Bar */}
      <header className="border-b border-[#262626] bg-[#0A0A0A] px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-7 w-7 rounded-md bg-white text-black flex items-center justify-center font-bold font-mono text-sm">
            S
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-white uppercase font-mono">
                SOVEREIGN SEQUENCER
              </h1>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border border-[#333333] text-[#A3A3A3]">
                Mini-Instantly · Multi-Campaign
              </span>
            </div>
            <p className="text-[11px] text-[#737373] mt-0.5">
              Round-Robin Multi-Inbox Engine · 4–8 Min Jitter · EST Business Window
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Campaign Switcher Dropdown */}
          <div className="flex items-center gap-2 border border-[#262626] bg-[#121212] px-2.5 py-1 rounded text-xs font-mono">
            <span className="text-[#737373] text-[11px]">Campaign:</span>
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="bg-transparent text-white text-xs font-mono focus:outline-none cursor-pointer pr-2"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#121212] text-white">
                  {c.name} ({c.status})
                </option>
              ))}
            </select>
          </div>

          {/* Campaign Status Toggle */}
          {activeCampaign && (
            <button
              onClick={() => toggleCampaignStatus(activeCampaign.id, activeCampaign.status)}
              className={`flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded border transition-all ${
                activeCampaign.status === "ACTIVE"
                  ? "bg-[#171717] border-[#404040] text-white hover:bg-[#262626]"
                  : "bg-black border-[#262626] text-[#737373] hover:text-white"
              }`}
            >
              {activeCampaign.status === "ACTIVE" ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  Active
                </>
              ) : (
                <>
                  <Pause className="h-3 w-3" />
                  Paused
                </>
              )}
            </button>
          )}

          {/* Test Dispatch Button */}
          <button
            onClick={() => triggerDispatch(true)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded bg-white text-black font-semibold hover:bg-[#D4D4D4] transition-all disabled:opacity-50"
            title="Force immediate dispatch of 1 lead without waiting for cron tick"
          >
            <Zap className="h-3 w-3 fill-black" />
            Dispatch Now
          </button>
        </div>
      </header>

      {/* Dispatch Output Notification */}
      {dispatchStatus && (
        <div className="bg-[#121212] border-b border-[#262626] px-6 py-2.5 text-xs font-mono text-[#A3A3A3] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-white" />
            <span>{dispatchStatus}</span>
          </div>
          <button onClick={() => setDispatchStatus(null)} className="text-[#555] hover:text-white">✕</button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        
        {/* Metric Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#0A0A0A] border border-[#262626] rounded-lg p-4">
            <div className="text-[11px] font-mono text-[#737373] uppercase tracking-wider flex items-center justify-between">
              <span>Queue Progress</span>
              <span className="text-[10px] text-white font-mono">{activeCampaign?.market_category || "GLOBAL"}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white">{sentCount}</span>
              <span className="text-xs text-[#737373] font-mono">/ {totalLeads} total</span>
            </div>
            <div className="mt-3 w-full bg-[#1A1A1A] h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-white h-full transition-all duration-500" 
                style={{ width: `${totalLeads > 0 ? (sentCount / totalLeads) * 100 : 0}%` }} 
              />
            </div>
          </div>

          <div className="bg-[#0A0A0A] border border-[#262626] rounded-lg p-4">
            <div className="text-[11px] font-mono text-[#737373] uppercase tracking-wider">Inboxes Pool</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white">{activeInboxes}</span>
              <span className="text-xs text-[#737373] font-mono">connected</span>
            </div>
            <div className="mt-2 text-[11px] font-mono text-[#737373]">
              Sent today: <strong className="text-white">{totalSentToday}</strong> / {totalDailyCapacity} cap
            </div>
          </div>

          <div className="bg-[#0A0A0A] border border-[#262626] rounded-lg p-4">
            <div className="text-[11px] font-mono text-[#737373] uppercase tracking-wider">Next Due Target</div>
            <div className="mt-2 text-sm font-semibold text-white truncate font-mono">
              {nextDue ? nextDue.recipient_email : "Queue Empty"}
            </div>
            <div className="mt-1 text-[11px] text-[#737373] font-mono">
              {nextDue ? new Date(nextDue.scheduled_at).toLocaleTimeString() : "Standby"}
            </div>
          </div>

          <div className="bg-[#0A0A0A] border border-[#262626] rounded-lg p-4">
            <div className="text-[11px] font-mono text-[#737373] uppercase tracking-wider">Target Schedule</div>
            <div className="mt-2 text-sm font-bold text-white font-mono">
              {activeCampaign ? `${activeCampaign.window_start} - ${activeCampaign.window_end}` : "07:30 - 18:00"} EST
            </div>
            <div className="mt-1 text-[11px] text-[#737373] font-mono flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-white" />
              <span>{activeCampaign?.status === "ACTIVE" ? "Autopilot Active" : "Campaign Paused"}</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-[#262626] pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("campaigns")}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-all ${
                activeTab === "campaigns"
                  ? "bg-[#171717] text-white border border-[#404040]"
                  : "text-[#737373] hover:text-white"
              }`}
            >
              Campaigns ({campaigns.length})
            </button>
            <button
              onClick={() => setActiveTab("queue")}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-all ${
                activeTab === "queue"
                  ? "bg-[#171717] text-white border border-[#404040]"
                  : "text-[#737373] hover:text-white"
              }`}
            >
              Leads Queue ({currentLeads.length})
            </button>
            <button
              onClick={() => setActiveTab("sequences")}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-all ${
                activeTab === "sequences"
                  ? "bg-[#171717] text-white border border-[#404040]"
                  : "text-[#737373] hover:text-white"
              }`}
            >
              Sequence & Copy
            </button>
            <button
              onClick={() => setActiveTab("inboxes")}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-all ${
                activeTab === "inboxes"
                  ? "bg-[#171717] text-white border border-[#404040]"
                  : "text-[#737373] hover:text-white"
              }`}
            >
              Inboxes Pool ({inboxes.length})
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-all ${
                activeTab === "logs"
                  ? "bg-[#171717] text-white border border-[#404040]"
                  : "text-[#737373] hover:text-white"
              }`}
            >
              Outbound Logs ({logs.length})
            </button>
          </div>

          {/* Action buttons contextual to active tab */}
          {activeTab === "campaigns" && (
            <button
              onClick={() => setShowCreateCampaign(true)}
              className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded bg-white text-black font-semibold hover:bg-[#D4D4D4] transition-all"
            >
              <Plus className="h-3 w-3" />
              New Campaign
            </button>
          )}

          {activeTab === "queue" && (
            <div className="flex items-center gap-2">
              <button
                onClick={exportToJson}
                className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded border border-[#262626] bg-[#0A0A0A] hover:bg-[#171717] text-white hover:border-[#404040] transition-all"
                title="Export leads in current view as JSON"
              >
                <Download className="h-3 w-3" />
                Export JSON
              </button>
              <button
                onClick={exportToCsv}
                className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded border border-[#262626] bg-[#0A0A0A] hover:bg-[#171717] text-[#A3A3A3] hover:text-white hover:border-[#404040] transition-all"
                title="Export leads in current view as CSV"
              >
                <Download className="h-3 w-3" />
                Export CSV
              </button>

              {/* Seed Market Presets Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowPresetMenu(!showPresetMenu)}
                  className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded border border-[#333333] bg-[#0A0A0A] hover:bg-[#1A1A1A] text-white transition-all"
                >
                  <Plus className="h-3 w-3" />
                  Seed Market
                  <ChevronDown className="h-3 w-3" />
                </button>

                {showPresetMenu && (
                  <div className="absolute right-0 mt-1 w-64 bg-[#121212] border border-[#262626] rounded shadow-xl z-20 py-1">
                    <button
                      onClick={() => handleSeedPreset("school_30")}
                      className="w-full text-left px-3 py-2 text-xs font-mono text-white hover:bg-[#1E1E1E] flex flex-col"
                    >
                      <span className="font-semibold">30 FL School Targets</span>
                      <span className="text-[10px] text-[#737373]">E-Rate Cat2 Low-Voltage Contractors</span>
                    </button>
                    <button
                      onClick={() => handleSeedPreset("airport_35")}
                      className="w-full text-left px-3 py-2 text-xs font-mono text-white hover:bg-[#1E1E1E] flex flex-col border-t border-[#1F1F1F]"
                    >
                      <span className="font-semibold">35 Airport Paving Targets</span>
                      <span className="text-[10px] text-[#737373]">FAA AIP Runway & Asphalt Contractors</span>
                    </button>
                    <button
                      onClick={() => handleSeedPreset("school_followup_40")}
                      className="w-full text-left px-3 py-2 text-xs font-mono text-white hover:bg-[#1E1E1E] flex flex-col border-t border-[#1F1F1F]"
                    >
                      <span className="font-semibold">40 School Follow-Ups</span>
                      <span className="text-[10px] text-[#737373]">Wednesday Step 2 Casual Bumps</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Custom JSON Upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded border border-[#262626] bg-[#0A0A0A] text-[#A3A3A3] hover:text-white hover:border-[#404040] transition-all"
                title="Upload external JSON file of leads"
              >
                <Upload className="h-3 w-3" />
                Upload JSON
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".json"
                className="hidden"
              />

              <button
                onClick={handleClearCurrentQueue}
                className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded border border-[#262626] text-[#737373] hover:text-white hover:border-[#404040] transition-all"
              >
                Clear Queue
              </button>
            </div>
          )}

          {activeTab === "inboxes" && (
            <button
              onClick={() => setShowAddInbox(true)}
              className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded bg-white text-black font-semibold hover:bg-[#D4D4D4] transition-all"
            >
              <Plus className="h-3 w-3" />
              Connect Gmail Account
            </button>
          )}
        </div>

        {/* TAB 1: CAMPAIGNS GRID (Instantly Standard) */}
        {activeTab === "campaigns" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-mono text-[#737373]">
              <span>ACTIVE OUTBOUND CAMPAIGNS ({campaigns.length})</span>
              <span>Click a campaign to manage leads and sequences</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {campaigns.map((camp) => {
                const campLeads = allLeads.filter((l) => l.campaign_id === camp.id);
                const cSent = campLeads.filter((l) => l.status === "SENT").length;
                const cTotal = campLeads.length;
                const isSelected = selectedCampaignId === camp.id;

                return (
                  <div
                    key={camp.id}
                    className={`bg-[#0A0A0A] border rounded-lg p-5 flex flex-col justify-between transition-all ${
                      isSelected ? "border-white/40 ring-1 ring-white/20" : "border-[#262626] hover:border-[#383838]"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-white font-mono">{camp.name}</h3>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#262626] bg-[#121212] text-[#A3A3A3]">
                              {camp.market_category}
                            </span>
                          </div>
                          <p className="text-xs text-[#737373] font-mono mt-1">
                            Window: {camp.window_start} - {camp.window_end} ({camp.timezone})
                          </p>
                        </div>

                        {/* Status Toggle */}
                        <button
                          onClick={() => toggleCampaignStatus(camp.id, camp.status)}
                          className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${
                            camp.status === "ACTIVE"
                              ? "bg-[#171717] border-[#404040] text-white"
                              : "bg-black border-[#262626] text-[#737373]"
                          }`}
                        >
                          {camp.status === "ACTIVE" ? "● Active" : "○ Paused"}
                        </button>
                      </div>

                      {/* Lead Stats for this campaign */}
                      <div className="mt-4 grid grid-cols-3 gap-2 bg-[#121212] border border-[#1F1F1F] rounded p-2.5 text-center font-mono text-xs">
                        <div>
                          <div className="text-[10px] text-[#737373] uppercase">Total</div>
                          <div className="text-sm font-semibold text-white">{cTotal}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#737373] uppercase">Sent</div>
                          <div className="text-sm font-semibold text-white">{cSent}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#737373] uppercase">Pending</div>
                          <div className="text-sm font-semibold text-white">{cTotal - cSent}</div>
                        </div>
                      </div>

                      <div className="mt-3 w-full bg-[#1A1A1A] h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-white h-full transition-all duration-300"
                          style={{ width: `${cTotal > 0 ? (cSent / cTotal) * 100 : 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="mt-5 pt-3 border-t border-[#1C1C1C] flex items-center justify-between">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedCampaignId(camp.id);
                            setActiveTab("queue");
                          }}
                          className="text-xs font-mono px-2.5 py-1 rounded bg-[#171717] hover:bg-[#262626] text-white border border-[#333333] transition-colors"
                        >
                          View Leads Queue
                        </button>
                        <button
                          onClick={() => {
                            setSelectedCampaignId(camp.id);
                            setActiveTab("sequences");
                          }}
                          className="text-xs font-mono px-2.5 py-1 rounded bg-black hover:bg-[#121212] text-[#A3A3A3] hover:text-white border border-[#262626] transition-colors"
                        >
                          Sequence
                        </button>
                      </div>

                      <button
                        onClick={() => handleDeleteCampaign(camp.id)}
                        className="text-[#555] hover:text-[#EF4444] transition-colors p-1"
                        title="Delete campaign"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: LEADS QUEUE */}
        {activeTab === "queue" && (
          <div className="bg-[#0A0A0A] border border-[#262626] rounded-lg overflow-hidden">
            <div className="p-3 bg-[#121212] border-b border-[#262626] flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-[#737373]">Viewing Queue:</span>
                <span className="font-semibold text-white">
                  {activeCampaign ? activeCampaign.name : "All Campaigns"}
                </span>
                <span className="text-[10px] text-[#A3A3A3] px-1.5 py-0.2 rounded border border-[#262626]">
                  {currentLeads.length} Leads
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#0F0F0F] border-b border-[#262626] text-[#737373] uppercase">
                  <tr>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">Scheduled / Sent At</th>
                    <th className="py-3 px-4">Subject Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F1F1F]">
                  {currentLeads.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#555]">
                        Queue is empty for this campaign. Click "Seed Market" or "Upload JSON" to populate.
                      </td>
                    </tr>
                  ) : (
                    currentLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-[#121212] transition-colors">
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                            lead.status === "SENT"
                              ? "bg-[#171717] text-white border border-[#333333]"
                              : lead.status === "FAILED"
                              ? "bg-[#1F1212] text-[#F87171] border border-[#3F1A1A]"
                              : "bg-[#0F172A] text-[#93C5FD] border border-[#1E293B]"
                          }`}>
                            {lead.status === "SENT" ? "✓ Sent" : lead.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-white">
                          {lead.recipient_name}
                          <div className="text-[11px] text-[#737373] font-normal">{lead.recipient_email}</div>
                        </td>
                        <td className="py-3 px-4 text-[#D4D4D4]">
                          {lead.company_name}
                          <div className="text-[11px] text-[#737373]">{lead.city}</div>
                        </td>
                        <td className="py-3 px-4 text-[#737373]">
                          {lead.sent_at 
                            ? new Date(lead.sent_at).toLocaleString() 
                            : new Date(lead.scheduled_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-[#A3A3A3] max-w-xs truncate" title={lead.subject_template}>
                          {lead.subject_template}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: SEQUENCES & COPY */}
        {activeTab === "sequences" && (
          <div className="bg-[#0A0A0A] border border-[#262626] rounded-lg p-6 space-y-6 font-mono">
            <div className="flex items-center justify-between border-b border-[#262626] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-white uppercase">
                  Email Sequence & Spintax Template
                </h3>
                <p className="text-xs text-[#737373] mt-0.5">
                  Custom copy for: <span className="text-white">{activeCampaign?.name}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                {seqSavedMessage && (
                  <span className="text-xs text-[#4ADE80]">✓ Saved to Campaign</span>
                )}
                <button
                  onClick={handleSaveSequence}
                  disabled={loading}
                  className="px-3 py-1.5 bg-white text-black text-xs font-semibold rounded hover:bg-[#D4D4D4] transition-all"
                >
                  Save Sequence
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-[#A3A3A3] mb-1">
                  Subject Line Template (Supports {"{spintax}"})
                </label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full bg-[#121212] border border-[#262626] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                  placeholder="{central fl charter rfp|e-rate category 2} / crew availability"
                />
              </div>

              <div>
                <label className="block text-xs uppercase text-[#A3A3A3] mb-1">
                  Email Body Template (Supports {"{spintax}"}, {"{first_name}"}, {"{company_name}"}, {"{city}"})
                </label>
                <textarea
                  rows={8}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full bg-[#121212] border border-[#262626] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                  placeholder="Hi {first_name}, ..."
                />
              </div>

              {/* Preview Box */}
              <div className="bg-[#121212] border border-[#1F1F1F] rounded p-4 text-xs">
                <div className="text-[10px] text-[#737373] uppercase mb-1">Live Variable Tokens Preview:</div>
                <div className="text-[#A3A3A3] space-y-1">
                  <div>• <code className="text-white">{"{first_name}"}</code> : Estimator / Michelle / Josh</div>
                  <div>• <code className="text-white">{"{company_name}"}</code> : Phoenix Of The Quad Cities / Jabber Telecom</div>
                  <div>• <code className="text-white">{"{city}"}</code> : Orlando / Port Byron</div>
                  <div>• <code className="text-white">{"{Hi|Hey|Good morning}"}</code> : Rotated dynamically per recipient</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: INBOXES POOL */}
        {activeTab === "inboxes" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-mono text-[#737373]">
              <span>ACTIVE GMAIL POOL ({inboxes.length})</span>
              <span>Round-Robin Rotation Enabled</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {inboxes.map((inbox) => (
                <div key={inbox.id} className="bg-[#0A0A0A] border border-[#262626] rounded-lg p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-white font-mono truncate">{inbox.email}</div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#171717] text-[#A3A3A3] border border-[#333333]">
                        {inbox.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#737373] font-mono mt-1">Sender: {inbox.display_name}</div>
                    
                    <div className="mt-3 text-xs font-mono text-[#A3A3A3]">
                      Sent today: <strong className="text-white">{inbox.sent_today}</strong> / {inbox.daily_limit} max
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#1C1C1C] flex items-center justify-between text-[11px] font-mono">
                    <span className="text-[#555]">
                      {inbox.last_sent_at && inbox.last_sent_at !== "1970-01-01T00:00:00.000Z"
                        ? `Last: ${new Date(inbox.last_sent_at).toLocaleTimeString()}`
                        : "Rested (Ready)"}
                    </span>
                    <button
                      onClick={() => handleDeleteInbox(inbox.id)}
                      className="text-[#555] hover:text-[#EF4444] transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: OUTBOUND LOGS */}
        {activeTab === "logs" && (
          <div className="bg-[#0A0A0A] border border-[#262626] rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#121212] border-b border-[#262626] text-[#737373] uppercase">
                  <tr>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">SMTP Response</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F1F1F]">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#555]">
                        No dispatch logs recorded yet.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#121212] transition-colors">
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                            log.status === "SUCCESS"
                              ? "bg-[#171717] text-white border border-[#333333]"
                              : "bg-[#1F1212] text-[#F87171] border border-[#3F1A1A]"
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-white font-semibold">{log.recipient_email}</td>
                        <td className="py-3 px-4 text-[#A3A3A3] max-w-xs truncate">{log.subject}</td>
                        <td className="py-3 px-4 text-[#737373]">{new Date(log.sent_at).toLocaleString()}</td>
                        <td className="py-3 px-4 text-[#555] truncate max-w-xs">{log.smtp_response || "OK"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>

      {/* MODAL: CREATE CAMPAIGN */}
      {showCreateCampaign && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#0A0A0A] border border-[#262626] rounded-lg max-w-md w-full p-6 space-y-4 font-mono">
            <div className="flex items-center justify-between border-b border-[#262626] pb-3">
              <h3 className="text-sm font-semibold text-white uppercase">Create New Outbound Campaign</h3>
              <button onClick={() => setShowCreateCampaign(false)} className="text-[#555] hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-[#A3A3A3] mb-1">Campaign Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Florida Commercial Solar EPC"
                  value={newCampName}
                  onChange={(e) => setNewCampName(e.target.value)}
                  className="w-full bg-[#121212] border border-[#262626] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block text-xs uppercase text-[#A3A3A3] mb-1">Market Category</label>
                <select
                  value={newCampMarket}
                  onChange={(e) => setNewCampMarket(e.target.value)}
                  className="w-full bg-[#121212] border border-[#262626] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                >
                  <option value="SCHOOL_WIFI">School Wi-Fi & Infrastructure (E-Rate)</option>
                  <option value="AIRPORT_PAVING">Airport Paving & Runway (FAA AIP)</option>
                  <option value="SOLAR_EPC">Commercial Solar EPC (Benchmarking)</option>
                  <option value="CUSTOM">Custom B2B Clearinghouse</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs uppercase text-[#A3A3A3] mb-1">Window Start</label>
                  <input
                    type="text"
                    value={newCampStart}
                    onChange={(e) => setNewCampStart(e.target.value)}
                    className="w-full bg-[#121212] border border-[#262626] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase text-[#A3A3A3] mb-1">Window End</label>
                  <input
                    type="text"
                    value={newCampEnd}
                    onChange={(e) => setNewCampEnd(e.target.value)}
                    className="w-full bg-[#121212] border border-[#262626] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#1C1C1C]">
                <button
                  type="button"
                  onClick={() => setShowCreateCampaign(false)}
                  className="px-3 py-1.5 text-xs text-[#737373] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 bg-white text-black text-xs font-semibold rounded hover:bg-[#D4D4D4] transition-all disabled:opacity-50"
                >
                  Create Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONNECT GMAIL INBOX */}
      {showAddInbox && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#0A0A0A] border border-[#262626] rounded-lg max-w-md w-full p-6 space-y-4 font-mono">
            <div className="flex items-center justify-between border-b border-[#262626] pb-3">
              <h3 className="text-sm font-semibold text-white uppercase">Connect Google Mailbox</h3>
              <button onClick={() => setShowAddInbox(false)} className="text-[#555] hover:text-white">✕</button>
            </div>

            {inboxError && (
              <div className="p-3 bg-[#1F1212] border border-[#3F1A1A] text-[#F87171] text-xs rounded">
                {inboxError}
              </div>
            )}

            <form onSubmit={handleAddInbox} className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-[#A3A3A3] mb-1">Google Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="pandu.outbound@gmail.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-[#121212] border border-[#262626] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block text-xs uppercase text-[#A3A3A3] mb-1">Sender Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="Pandu Utama"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full bg-[#121212] border border-[#262626] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block text-xs uppercase text-[#A3A3A3] mb-1">Google App Password (16 chars)</label>
                <input
                  type="password"
                  required
                  placeholder="xxxx xxxx xxxx xxxx"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#121212] border border-[#262626] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block text-xs uppercase text-[#A3A3A3] mb-1">Daily Sending Cap</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={50}
                  value={newDailyLimit}
                  onChange={(e) => setNewDailyLimit(Number(e.target.value))}
                  className="w-full bg-[#121212] border border-[#262626] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#1C1C1C]">
                <button
                  type="button"
                  onClick={() => setShowAddInbox(false)}
                  className="px-3 py-1.5 text-xs text-[#737373] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 bg-white text-black text-xs font-semibold rounded hover:bg-[#D4D4D4] transition-all disabled:opacity-50"
                >
                  Verify & Connect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
