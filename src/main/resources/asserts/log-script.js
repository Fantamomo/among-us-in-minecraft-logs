'use strict';

const BOT_NAMES = new Set(['alex','ari','efi','kai','makena','noor','steve','sunny','zuri']);

const bots = new Set();
const playerNames = {};
let G = {};
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
function setStyle(id, prop, val) { const el = document.getElementById(id); if (el) el.style[prop] = val; }
function getEl(id) { return document.getElementById(id); }
function shortUuid(u) { return u ? u.slice(0, 8) + '…' : '—'; }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function isBot(uuid) {
    if (!uuid) return false;
    const name = playerNames[uuid]?.mc;
    return name ? BOT_NAMES.has(name.toLowerCase()) : false;
}

function getAvatarUrl(uuid) { return `https://mc-heads.net/avatar/${uuid}/32`; }

function fmtRelative(ts, base) {
    const diff = Math.floor((new Date(ts) - new Date(base)) / 1000);
    if (isNaN(diff) || diff < 0) return fmtAbsolute(ts);
    return `+${Math.floor(diff / 60)}:${String(diff % 60).padStart(2,'0')}`;
}
function fmtAbsolute(ts) { return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
function fmtDuration(ms) {
    const s = Math.floor(Math.abs(ms) / 1000);
    const m = Math.floor(s / 60), rs = s % 60;
    return m > 0 ? `${m}m ${rs}s` : `${rs}s`;
}

function isImposterRole(r) {
    if (!r || typeof r !== 'string') return false;
    const l = r.toLowerCase();
    return l.includes('imposter') || l.includes('impostor') || l.includes('imposter');
}

function playerLabel(u) { if (!u) return '—'; return playerNames[u]?.display || shortUuid(u); }

function pChip(uuid, forceBot) {
    if (!uuid) return `<span class="mono t4" style="font-size:.66rem;">—</span>`;
    const bot = forceBot || isBot(uuid);
    const dead = G.players?.[uuid]?.dead;
    const deadCls = dead ? ' is-dead' : '';
    const botCls = bot ? ' is-bot' : '';
    const botBadge = bot ? ` <span style="font-size:.5rem;opacity:.7;color:var(--safe)">🤖</span>` : '';
    return `<span class="p-chip${deadCls}${botCls}" data-player-chip="${uuid}"><img src="${getAvatarUrl(uuid)}" alt="" onerror="this.style.display='none'">${escHtml(playerLabel(uuid))}${botBadge}</span>`;
}

function pAv(uuid, size=14) {
    return `<img src="${getAvatarUrl(uuid)}" width="${size}" height="${size}" style="image-rendering:pixelated;border-radius:2px;vertical-align:middle;" onerror="this.style.display='none'">`;
}

document.addEventListener('click', e => {
    const chip = e.target.closest('[data-player-chip]');
    if (chip) { e.stopPropagation(); openPlayerModal(chip.dataset.playerChip); return; }
    const catBadge = e.target.closest('[data-filter-cat]');
    if (catBadge) { e.stopPropagation(); soloFilter(catBadge.dataset.filterCat); return; }
    const pcard = e.target.closest('[data-player-card]');
    if (pcard) { openPlayerModal(pcard.dataset.playerCard); return; }
    const actRow = e.target.closest('[data-activity-player]');
    if (actRow) { filterToPlayer(actRow.dataset.activityPlayer); return; }
    const tlEntry = e.target.closest('.tl-entry[data-evt-idx]');
    if (tlEntry && !e.target.closest('[data-player-chip]') && !e.target.closest('[data-filter-cat]')) {
        const raw = tlEntry.querySelector('.tl-raw'); if (raw) tlEntry.classList.toggle('tl-expanded'); return;
    }
    const meetCard = e.target.closest('[data-meeting-idx]');
    if (meetCard) { openMeetingDetail(parseInt(meetCard.dataset.meetingIdx)); return; }
});

async function fetchPlayerName(uuid, idx) {
    if (playerNames[uuid]) return playerNames[uuid].display;
    if (bots.has(uuid)) {
        const bot = `Bot ${idx}`;
        playerNames[uuid] = { display: bot, mc: bot, isBot: true };
        return bot;
    }
    const fallback = `Player ${idx}`;
    try {
        const res = await fetch(`https://api.ashcon.app/mojang/v2/user/${uuid.replace(/-/g,'')}`, { signal: AbortSignal.timeout(4500) });
        if (!res.ok) throw 0;
        const d = await res.json();
        const mc = d.username || fallback;
        const botFlag = BOT_NAMES.has(mc.toLowerCase());
        playerNames[uuid] = { display: mc, mc, isBot: botFlag };
        return mc;
    } catch {
        playerNames[uuid] = { display: fallback, mc: null, isBot: false };
        return fallback;
    }
}

const CATEGORIES = {
    game:     ['game_start','game_end','game_start_countdown','countdown_aborted','winner_announcement'],
    phase:    ['phase_change'],
    host:     ['host_change'],
    player:   ['player_join','player_leave','player_disconnect','player_rejoin','player_remove'],
    death:    ['player_death'],
    meeting:  ['meeting_called','meeting_vote_for','meeting_vote_skip','meeting_result'],
    task:     ['task_assigned','task_completed','task_failed','task_started','task_step_completed','task_unassigned'],
    sabotage: ['start_sabotage','end_sabotage'],
    vent:     ['enter_vent','exit_vent','switch_vent','start_creating_vent','finish_creating_vent','failed_creating_vent'],
    camera:   ['join_camera','leave_camera','switch_camera'],
    assign:   ['assign_role','assign_modification'],
    chat:     ['player_chat','player_chat_failed'],
    settings: ['settings_change'],
    ability:  ['arsonist_douse','camouflage_mode_activated','cannibal_eat_body','reveal_team',
        'enter_ghost_form','exit_ghost_form','start_morph','end_morph',
        'snitch_one_task_left','snitch_finished_tasks','executioner_target_selected'],
};

function getCat(type) {
    for (const [cat, types] of Object.entries(CATEGORIES)) if (types.includes(type)) return cat;
    return 'other';
}

function describeEvent(e) {
    const d = e.data || {};
    switch (e.type) {
        case 'game_start': return { text: '🚀 Spiel <strong class="t1">gestartet</strong>' };
        case 'game_end': return { text: '🏁 Spiel <strong class="t1">beendet</strong>' };
        case 'game_start_countdown': return { text: '⏳ Countdown gestartet' };
        case 'countdown_aborted': return { text: `⏳ Countdown <span class="c-red">abgebrochen</span>`, extra: `Grund: ${d.reason} · ${d.remaining}s verbleibend` };
        case 'winner_announcement': {
            const isImp = isImposterRole(d.winner) || d.winner?.toLowerCase().includes('impost');
            return { text: `🏆 Gewinner: <strong class="${isImp ? 'c-red' : 'c-accent'}">${escHtml(d.winner || '?')}</strong>` };
        }
        case 'phase_change': return { text: `Phase <span class="t3">${d.old}</span> → <strong class="t1">${d.new}</strong>` };
        case 'host_change': return { text: `★ Host ${d.old ? pChip(d.old) : '<span class="t4">—</span>'} → ${d.new ? pChip(d.new) : '<span class="t4">—</span>'}` };
        case 'player_join': return { text: `➕ ${pChip(d.player)} beigetreten${d.type ? ` <span class="t4 mono" style="font-size:.62rem;">[${d.type}]</span>` : ''}` };
        case 'player_leave': return { text: `➖ ${pChip(d.player)} verlassen` };
        case 'player_disconnect': return { text: `⚡ ${pChip(d.player)} <span class="c-orange">getrennt</span>` };
        case 'player_rejoin': return { text: `↩ ${pChip(d.player)} wieder beigetreten` };
        case 'player_remove': return { text: `✕ ${pChip(d.player)} <span class="c-red">entfernt</span>` };
        case 'player_death': {
            const r = d.reason;
            if (typeof r === 'object' && r?.type === 'murdered')
                return { text: `💀 ${pChip(d.player)} <span class="c-red">ermordet</span>`, extra: `Killer: ${pChip(r.killer)}` };
            return { text: `💀 ${pChip(d.player)} <span class="c-orange">gestorben</span>`, extra: `Grund: ${r}` };
        }
        case 'assign_role': return { text: `🎭 ${pChip(d.player)} → <strong class="${isImposterRole(d.role) ? 'c-red' : 'c-accent'}">${escHtml(d.role||'?')}</strong>` };
        case 'assign_modification': return { text: `🔧 ${pChip(d.player)} Modifikation: <strong>${escHtml(d.modification||'?')}</strong>` };
        case 'task_assigned': return { text: `📋 ${pChip(d.player)} ← <span class="t2">${escHtml(d.task?.replace(/_/g,' ')||'?')}</span>` };
        case 'task_started': return { text: `▶ ${pChip(d.player)} startet <em class="t1">${escHtml(d.task?.replace(/_/g,' ')||'?')}</em>` };
        case 'task_step_completed': return { text: `▶ ${pChip(d.player)} Schritt ${d.step} · <em>${escHtml(d.task?.replace(/_/g,' ')||'?')}</em>` };
        case 'task_completed': return { text: `✅ ${pChip(d.player)} <span class="c-green">abgeschlossen</span> <em>${escHtml(d.task?.replace(/_/g,' ')||'?')}</em>` };
        case 'task_failed': return { text: `❌ ${pChip(d.player)} <span class="c-red">gescheitert</span> <em>${escHtml(d.task?.replace(/_/g,' ')||'?')}</em>` };
        case 'task_unassigned': return { text: `✕ ${pChip(d.player)} Task entfernt: <em>${escHtml(d.task?.replace(/_/g,' ')||'?')}</em>` };
        case 'start_sabotage': return { text: `⚠ Sabotage: <strong style="color:#ff6600">${escHtml(d.sabotage?.replace(/_/g,' ')||'?')}</strong>`, extra: d.by ? `von ${pChip(d.by)}` : 'automatisch' };
        case 'end_sabotage': return { text: `Sabotage <strong>${escHtml(d.sabotage?.replace(/_/g,' ')||'?')}</strong> ${d.fixed ? '<span class="c-green">behoben ✓</span>' : '<span class="c-red">abgelaufen ✗</span>'}` };
        case 'enter_vent': return { text: `🕳 ${pChip(d.player)} <span style="color:#22d3ee">Vent betreten</span>`, extra: d.location ? `(${d.location.x},${d.location.y},${d.location.z}) Gruppe ${d.ventGroup}` : '' };
        case 'exit_vent': return { text: `🕳 ${pChip(d.player)} Vent verlassen`, extra: d.location ? `(${d.location.x},${d.location.y},${d.location.z})` : '' };
        case 'switch_vent': return { text: `🕳 ${pChip(d.player)} Vent gewechselt`, extra: d.from && d.to ? `(${d.from.x},${d.from.z}) → (${d.to.x},${d.to.z}) Gruppe ${d.ventGroup}` : '' };
        case 'start_creating_vent': return { text: `🕳 ${pChip(d.player)} <span class="c-orange">erstellt Vent</span>`, extra: d.location ? `(${d.location.x},${d.location.y},${d.location.z}) Gruppe ${d.ventGroup}` : '' };
        case 'finish_creating_vent': return { text: `🕳 ${pChip(d.player)} Vent <span class="c-green">erstellt ✓</span>`, extra: d.location ? `(${d.location.x},${d.location.y},${d.location.z})` : '' };
        case 'failed_creating_vent': return { text: `🕳 ${pChip(d.player)} Vent-Erstellung <span class="c-red">fehlgeschlagen</span>`, extra: d.location ? `(${d.location.x},${d.location.y},${d.location.z})` : '' };
        case 'join_camera': return { text: `📹 ${pChip(d.player)} <span style="color:#34d399">Kamera</span>: <strong>${escHtml(d.camera||'?')}</strong>` };
        case 'switch_camera': return { text: `📹 ${pChip(d.player)} Kamera gewechselt`, extra: `${escHtml(d.old||'?')} → ${escHtml(d.new||'?')}` };
        case 'leave_camera': return { text: `📹 ${pChip(d.player)} Kamera verlassen: <strong>${escHtml(d.camera||'?')}</strong>` };
        case 'meeting_called': return { text: `📢 Meeting von ${pChip(d.caller)}`, extra: `${d.reason}${d.body ? ` · Leiche: ${pChip(d.body)}` : ''}` };
        case 'meeting_vote_for': return { text: `🗳 ${pChip(d.voter)} → ${pChip(d.target)}${d.mayorVote ? ' <span class="c-orange mono" style="font-size:.58rem;">MAYOR</span>' : ''}` };
        case 'meeting_vote_skip': return { text: `🗳 ${pChip(d.voter)} → <span class="t3">SKIP</span>${d.mayorVote ? ' <span class="c-orange mono" style="font-size:.58rem;">MAYOR</span>' : ''}` };
        case 'meeting_result': return { text: `⚡ Meeting: ${d.ejected ? `${pChip(d.ejected)} <span class="c-red">rausgeworfen</span>` : '<span class="t3">kein Rauswurf</span>'}` };
        case 'settings_change': return { text: `⚙ <span class="c-accent">${escHtml(d.id||'?')}</span>`, extra: `<span class="c-red" style="text-decoration:line-through">${escHtml(d.old||'?')}</span> → <span class="c-green">${escHtml(d.new||'?')}</span>` };
        case 'player_chat': return { text: `💬 ${pChip(d.player)} <span class="t4">[${d.type||'?'}]</span>: <em class="t2">"${escHtml(d.message||'')}"</em>` };
        case 'player_chat_failed': return { text: `🚫 ${pChip(d.player)} blockiert: <em class="t4">"${escHtml(d.message||'')}"</em>` };
        case 'arsonist_douse': return { text: `🔥 ${pChip(d.arsonist)} <span style="color:#ff6600">übergoss</span> ${pChip(d.target)}` };
        case 'camouflage_mode_activated': return { text: `🫥 ${pChip(d.player)} <span class="c-purple">Tarnung aktiviert</span>` };
        case 'cannibal_eat_body': return { text: `🦴 ${pChip(d.cannibal)} <span class="c-red">konsumierte Körper</span>`, extra: d.body ? `Opfer: ${pChip(d.body)}` : '' };
        case 'reveal_team': return { text: `🔮 ${pChip(d.seer)} <span class="c-purple">enthüllte</span> ${pChip(d.target)}s Team` };
        case 'enter_ghost_form': return { text: `👻 ${pChip(d.player)} <span class="t3">Geisterform aktiviert</span>` };
        case 'exit_ghost_form': return { text: `👻 ${pChip(d.player)} Geisterform beendet` };
        case 'start_morph': return { text: `🎭 ${pChip(d.player)} <span class="c-purple">verwandelt</span> → ${pChip(d.target)}` };
        case 'end_morph': return { text: `🎭 ${pChip(d.player)} Verwandlung beendet` };
        case 'snitch_one_task_left': return { text: `🔔 ${pChip(d.player)} <span class="c-orange">Snitch: noch 1 Task</span>` };
        case 'snitch_finished_tasks': return { text: `🔔 ${pChip(d.player)} <span class="c-green">Snitch: alle Tasks erledigt</span>` };
        case 'executioner_target_selected': return { text: `⚖ ${pChip(d.player)} <span class="c-purple">Vollstrecker</span>`, extra: d.target ? `Ziel: ${pChip(d.target)}` : 'kein Ziel' };
        default: return { text: `<span class="t3">${escHtml(e.type.replace(/_/g,' '))}</span>` };
    }
}

function eventUuids(e) {
    const d = e.data || {};
    const set = new Set();
    ['player','caller','voter','target','by','arsonist','cannibal','seer','body'].forEach(k => {
        if (d[k] && UUID_RX.test(d[k])) set.add(d[k]);
    });
    if (d.reason?.killer) set.add(d.reason.killer);
    if (d.old && UUID_RX.test(d.old)) set.add(d.old);
    if (d.new && UUID_RX.test(d.new)) set.add(d.new);
    return set;
}

let activeFilt = new Set();
let searchQuery = '';
let useRegex = false;
let playerFilterUuids = new Set();
let roleFilter = '';
let sortAsc = true;

async function renderLog(data) {
    setStyle('loading-screen','display','none');
    setStyle('log-section','display','block');

    const log = data.log || [];
    const createdAt = data.createdAt || new Date().toISOString();
    const metadata = data.metadata || {};

    const uuidSet = new Set();
    function collectUUID(v) { if (v && typeof v === 'string' && UUID_RX.test(v)) uuidSet.add(v); }
    log.forEach(e => {
        const d = e.data || {};
        for (const v of Object.values(d)) {
            collectUUID(v);
            if (v && typeof v === 'object') for (const vv of Object.values(v)) collectUUID(vv);
        }
    });
    const allUuids = [...uuidSet];

    const pgEl = getEl('players-grid');
    if (pgEl) pgEl.innerHTML = '<div class="loading-names">// Lade Spielernamen…</div>';

    log.filter(e => e.type === 'player_join').forEach(e => {
        const d = e.data || {};
        const type = d.type;
        const uuid = d.player;
        if (type === 'bot' && uuid && UUID_RX.test(uuid)) {
            bots.add(uuid);
        }
    })

    await Promise.all(allUuids.map((u, i) => {
        return fetchPlayerName(u, i + 1);
    }));

    const players = {};
    allUuids.forEach(uuid => {
        players[uuid] = {
            role: null, modifications: [],
            dead: false, deadTs: null, deadReason: null, killer: null,
            wasHost: false, wasEjected: false,
            tasks: { assigned: new Set(), completed: new Set(), failed: new Set() },
            kills: [],
            meetings: { called: 0, bodyReports: 0 },
            votes: [],
            chat: [],
            vents: 0, cameras: 0, sabotages: 0,
            morphs: 0, ghostForms: 0, camouflages: 0,
            dousedTargets: [],
            executionerTarget: null,
            snitchOneTaskLeft: false, snitchFinished: false,
            disconnects: 0,
            events: [],
            isBot: playerNames[uuid]?.isBot || false,
        };
    });

    log.forEach((e, idx) => {
        const d = e.data || {};
        const seen = new Set();
        function notePlayer(u) { if (u && players[u]) { players[u].events.push(idx); seen.add(u); } }
        ['player','caller','voter','target','by','arsonist','cannibal','seer','body'].forEach(k => {
            if (d[k] && UUID_RX.test(d[k])) notePlayer(d[k]);
        });
        if (d.reason?.killer) notePlayer(d.reason.killer);
        if (d.old && UUID_RX.test(d.old)) notePlayer(d.old);
        if (d.new && UUID_RX.test(d.new)) notePlayer(d.new);
        seen.forEach(u => {
            const arr = players[u].events;
            if (arr.length > 1 && arr[arr.length-1] === arr[arr.length-2]) arr.pop();
        });

        switch (e.type) {
            case 'assign_role': if (players[d.player]) players[d.player].role = d.role; break;
            case 'assign_modification': if (players[d.player]) players[d.player].modifications.push(d.modification); break;
            case 'host_change': if (d.new && players[d.new]) players[d.new].wasHost = true; break;
            case 'player_death':
                if (players[d.player]) {
                    players[d.player].dead = true; players[d.player].deadTs = e.timestamp;
                    const r = d.reason;
                    if (typeof r === 'string') {
                        players[d.player].deadReason = r;
                        if (r === 'ejected') players[d.player].wasEjected = true;
                    } else if (r?.type === 'murdered') {
                        players[d.player].deadReason = 'murdered';
                        players[d.player].killer = r.killer;
                        if (players[r.killer]) players[r.killer].kills.push(d.player);
                    }
                }
                break;
            case 'player_disconnect': if (players[d.player]) players[d.player].disconnects++; break;
            case 'task_assigned': if (players[d.player]) players[d.player].tasks.assigned.add(d.task); break;
            case 'task_completed': if (players[d.player]) players[d.player].tasks.completed.add(d.task); break;
            case 'task_failed': if (players[d.player]) players[d.player].tasks.failed.add(d.task); break;
            case 'meeting_called':
                if (players[d.caller]) { players[d.caller].meetings.called++; if (d.reason === 'BODY') players[d.caller].meetings.bodyReports++; }
                break;
            case 'meeting_vote_for': if (players[d.voter]) players[d.voter].votes.push({ target: d.target, ts: e.timestamp, mayor: d.mayorVote }); break;
            case 'player_chat':
            case 'player_chat_failed':
                if (players[d.player]) players[d.player].chat.push({ msg: d.message, type: e.type === 'player_chat_failed' ? 'failed' : d.type, ts: e.timestamp });
                break;
            case 'enter_vent': if (players[d.player]) players[d.player].vents++; break;
            case 'join_camera': if (players[d.player]) players[d.player].cameras++; break;
            case 'start_sabotage': if (d.by && players[d.by]) players[d.by].sabotages++; break;
            case 'start_morph': if (players[d.player]) players[d.player].morphs++; break;
            case 'enter_ghost_form': if (players[d.player]) players[d.player].ghostForms++; break;
            case 'camouflage_mode_activated': if (players[d.player]) players[d.player].camouflages++; break;
            case 'arsonist_douse': if (players[d.arsonist]) players[d.arsonist].dousedTargets.push(d.target); break;
            case 'executioner_target_selected': if (players[d.player]) players[d.player].executionerTarget = d.target; break;
            case 'snitch_one_task_left': if (players[d.player]) players[d.player].snitchOneTaskLeft = true; break;
            case 'snitch_finished_tasks': if (players[d.player]) players[d.player].snitchFinished = true; break;
        }
    });

    G = { log, createdAt, metadata, players, allUuids };

    const winnerEvt = log.find(e => e.type === 'winner_announcement');
    const winner = winnerEvt?.data?.winner || null;
    if (winner) {
        const banner = getEl('winner-banner');
        banner.style.display = '';
        const isImpWin = isImposterRole(winner) || winner.toLowerCase().includes('impost');
        banner.className = 'winner-banner ' + (isImpWin ? 'imposters' : 'crewmates');
        banner.innerHTML = `<div class="winner-title">${isImpWin ? '🔴' : '🔵'} ${escHtml(winner.toUpperCase())} GEWINNT</div>
        <div class="winner-sub">${isImpWin ? 'IMPOSTOREN HABEN DIE CREW ELIMINIERT' : 'CREW HAT IHRE AUFGABEN ABGESCHLOSSEN'}</div>`;
    }

    const startEvt = log.find(e => e.type === 'game_start');
    const endEvt = log.find(e => e.type === 'game_end');
    const gameDur = startEvt && endEvt ? fmtDuration(new Date(endEvt.timestamp) - new Date(startEvt.timestamp)) : '';
    const lobbyDur = startEvt ? fmtDuration(new Date(startEvt.timestamp) - new Date(createdAt)) : '';

    setHTML('meta-row', [
        metadata.code ? `CODE: <span>${escHtml(metadata.code)}</span>` : null,
        metadata.area ? `MAP: <span>${escHtml(metadata.area)}</span>` : null,
        gameDur ? `SPIEL: <span>${gameDur}</span>` : null,
        lobbyDur ? `LOBBY: <span>${lobbyDur}</span>` : null,
        `EVENTS: <span>${log.length}</span>`,
        `SPIELER: <span>${allUuids.length}</span>`,
        createdAt ? `DATUM: <span>${new Date(createdAt).toLocaleDateString('de-DE')}</span>` : null,
        metadata.maxPlayers ? `MAX: <span>${metadata.maxPlayers}</span>` : null,
    ].filter(Boolean).map(c => `<span class="meta-chip">${c}</span>`).join(''));

    const murders = log.filter(e => e.type === 'player_death' && typeof e.data?.reason === 'object').length;
    const meetings = log.filter(e => e.type === 'meeting_called').length;
    const sabotages = log.filter(e => e.type === 'start_sabotage').length;
    const tasksDone = log.filter(e => e.type === 'task_completed').length;
    const ventsUsed = log.filter(e => e.type === 'enter_vent').length;
    const chatCount = log.filter(e => e.type === 'player_chat').length;
    const ejections = log.filter(e => e.type === 'meeting_result' && e.data?.ejected).length;
    const botCount = allUuids.filter(u => players[u].isBot).length;
    const morphCount = log.filter(e => e.type === 'start_morph').length;
    const douseCount = log.filter(e => e.type === 'arsonist_douse').length;

    const stats = [
        { val: allUuids.length - botCount, lbl: 'Spieler', col: 'var(--accent)' },
        { val: botCount, lbl: 'Bots', col: 'var(--safe)' },
        { val: murders, lbl: 'Morde', col: 'var(--danger)' },
        { val: meetings, lbl: 'Meetings', col: 'var(--purple)' },
        { val: ejections, lbl: 'Ejections', col: 'var(--warn)' },
        { val: tasksDone, lbl: 'Tasks Done', col: 'var(--safe)' },
        { val: sabotages, lbl: 'Sabotagen', col: '#ff6600' },
        { val: ventsUsed, lbl: 'Vent-Uses', col: '#22d3ee' },
        { val: chatCount, lbl: 'Nachrichten', col: 'var(--t2)' },
    ];
    if (morphCount > 0) stats.push({ val: morphCount, lbl: 'Morphs', col: 'var(--pink)' });
    if (douseCount > 0) stats.push({ val: douseCount, lbl: 'Douses', col: '#ff6600' });

    setHTML('stats-row', stats.map(s =>
        `<div class="col-6 col-sm-4 col-md-3 col-xl-auto" style="flex:1;min-width:72px;">
      <div class="stat-box" style="--stat-color:${s.col}"><div class="stat-val" style="color:${s.col}">${s.val}</div><div class="stat-lbl">${s.lbl}</div></div>
    </div>`).join(''));

    buildKillBoard(log, players, createdAt);
    buildPlayers(allUuids, players, log, createdAt);
    buildPhaseTimeline(log, createdAt, endEvt);
    buildActivity(allUuids, players, log);
    buildTaskProgress(log);
    buildVentSection(log, createdAt);
    buildAbilities(log, createdAt, players);
    buildSettings(log);
    buildMeetings(log, players, createdAt);
    buildInsights(players, log, createdAt, startEvt);
    buildChat(log, createdAt);
    buildTimeline(log, createdAt, allUuids, players);
}

function buildKillBoard(log, players, createdAt) {
    const murders = log.filter(e => e.type === 'player_death' && typeof e.data?.reason === 'object' && e.data.reason.type === 'murdered');
    if (murders.length === 0) return;
    setStyle('kill-board-section','display','');
    setHTML('kill-board', murders.map(e => {
        const killer = e.data.reason.killer;
        const victim = e.data.player;
        return `<div class="kill-entry">
      ${pAv(killer, 20)} <span class="t1" style="font-size:.82rem;font-family:'Rajdhani',sans-serif;font-weight:600;">${escHtml(playerLabel(killer))}</span>
      <span class="kill-arrow">⚔</span>
      ${pAv(victim, 20)} <span class="t2" style="font-size:.82rem;font-family:'Rajdhani',sans-serif;">${escHtml(playerLabel(victim))}</span>
      <span class="kill-time">${fmtRelative(e.timestamp, createdAt)}</span>
    </div>`;
    }).join(''));
}

function buildPlayers(allUuids, players, log, createdAt) {
    const grid = getEl('players-grid');
    if (!grid) return;
    grid.innerHTML = '';
    allUuids.forEach(uuid => {
        const p = players[uuid];
        const isImp = isImposterRole(p.role);
        const roleClass = isImp ? 'impostor' : (p.role ? 'crewmate' : '');
        const deadClass = p.dead ? 'dead' : '';
        const botClass = p.isBot ? 'is-bot' : '';
        const rbClass = isImp ? 'rb-imp' : (p.role ? 'rb-crew' : (p.isBot ? 'rb-bot' : 'rb-other'));
        const pct = p.tasks.assigned.size > 0 ? Math.round(p.tasks.completed.size / p.tasks.assigned.size * 100) : 0;

        let deathLine = '';
        if (p.dead) {
            if (p.deadReason === 'murdered' && p.killer) deathLine = `<div class="death-reason">⚔ von ${pAv(p.killer,12)} ${escHtml(playerLabel(p.killer))}</div>`;
            else deathLine = `<div class="death-reason">✝ ${p.deadReason || 'tot'}</div>`;
        }

        const miniStats = [];
        if (p.kills.length > 0) miniStats.push(`⚔${p.kills.length}`);
        if (p.vents > 0) miniStats.push(`🕳${p.vents}`);
        if (p.cameras > 0) miniStats.push(`📹${p.cameras}`);
        if (p.morphs > 0) miniStats.push(`🎭${p.morphs}`);
        if (p.camouflages > 0) miniStats.push(`🫥${p.camouflages}`);
        if (p.dousedTargets.length > 0) miniStats.push(`🔥${p.dousedTargets.length}`);

        const card = document.createElement('div');
        card.className = `player-card ${roleClass} ${deadClass} ${botClass}`.trim();
        card.dataset.playerCard = uuid;
        card.title = 'Klicken für Details';
        card.innerHTML = `
      <div class="player-avatar"><img src="${getAvatarUrl(uuid)}" alt="" onerror="this.style.display='none'"></div>
      <div style="flex:1;min-width:0;">
        <div class="player-name">${escHtml(playerLabel(uuid))}${p.wasHost ? ` <span style="color:var(--warn);font-size:.6rem;" title="War Host">★</span>` : ''}${p.isBot ? ` <span style="color:var(--safe);font-size:.58rem;" title="Bot">🤖</span>` : ''}</div>
        <div class="player-uuid-short" title="${uuid}">${shortUuid(uuid)}</div>
        <span class="role-badge ${rbClass}">${p.isBot ? 'BOT · ' : ''}${escHtml(p.role || 'unbekannt')}</span>
        ${deathLine}
        ${p.tasks.assigned.size > 0 ? `<div style="margin-top:4px;"><div class="mono t4" style="font-size:.54rem;">TASKS ${p.tasks.completed.size}/${p.tasks.assigned.size}</div><div class="task-bar"><div class="task-bar-fill" style="width:${pct}%"></div></div></div>` : ''}
        ${miniStats.length > 0 ? `<div class="player-stats-row">${miniStats.join(' ')}</div>` : ''}
        ${p.modifications.length > 0 ? `<div style="margin-top:2px;">${p.modifications.map(m => `<span class="role-badge rb-other">${escHtml(m)}</span>`).join(' ')}</div>` : ''}
      </div>`;
        grid.appendChild(card);
    });

    const pfSelect = getEl('pf-select');
    if (pfSelect) {
        pfSelect.innerHTML = `<option value="">Alle Spieler</option>` +
            allUuids.map(u => {
                const bot = players[u].isBot ? ' 🤖' : '';
                return `<option value="${u}">${escHtml(playerLabel(u))}${bot}</option>`;
            }).join('');
    }
}

function buildPhaseTimeline(log, createdAt, endEvt) {
    const phaseEvents = log.filter(e => e.type === 'phase_change');
    const logEnd = endEvt?.timestamp || log[log.length-1]?.timestamp || createdAt;
    const totalMs = new Date(logEnd) - new Date(createdAt);
    if (phaseEvents.length === 0 || totalMs <= 0) return;

    setStyle('phase-bar-section','display','');
    const phaseColors = {
        LOBBY:'#3b82f6', STARTING:'#f59e0b', RUNNING:'#22c55e',
        CALLING_MEETING:'#a855f7', DISCUSSION:'#c084fc', VOTING:'#e879f9',
        ENDING_MEETING:'#f0abfc', FINISHED:'#64748b'
    };
    const segs = [];
    let prevTs = new Date(createdAt), prevPhase = 'LOBBY';
    phaseEvents.forEach(pe => {
        const ts = new Date(pe.timestamp);
        const dur = ts - prevTs;
        if (dur > 0) segs.push({ phase: prevPhase, dur });
        prevTs = ts; prevPhase = pe.data.new;
    });
    segs.push({ phase: prevPhase, dur: new Date(logEnd) - prevTs });

    setHTML('phase-bar', segs.map(s => {
        const pct = Math.max(1, Math.round(s.dur / totalMs * 100));
        const col = phaseColors[s.phase] || '#475569';
        return `<div class="phase-seg" style="width:${pct}%;background:${col}" title="${s.phase}: ${fmtDuration(s.dur)}">${pct > 8 ? s.phase.replace(/_/g, ' ') : ''}</div>`;
    }).join(''));

    const seen = [...new Set(segs.map(s => s.phase))];
    setHTML('phase-legend', seen.map(ph => {
        const col = phaseColors[ph] || '#475569';
        const total = segs.filter(s => s.phase === ph).reduce((a,s) => a+s.dur, 0);
        return `<span class="mono t3" style="font-size:.58rem;display:flex;align-items:center;gap:4px;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${col};flex-shrink:0;"></span>
      ${ph} <span class="t4">(${fmtDuration(total)})</span></span>`;
    }).join(''));
}

function buildActivity(allUuids, players, log) {
    const actCount = {};
    allUuids.forEach(u => { actCount[u] = 0; });
    log.forEach(e => {
        eventUuids(e).forEach(u => { if (actCount[u] !== undefined) actCount[u]++; });
    });
    const maxAct = Math.max(1, ...Object.values(actCount));
    const COLORS = ['#00c8ff','#b44bff','#00e676','#ff6600','#ff4488','#ffaa00','#34d399','#22d3ee','#818cf8'];
    setHTML('activity-section', allUuids.map((uuid, i) => {
        const cnt = actCount[uuid] || 0;
        const botTag = players[uuid].isBot ? ' 🤖' : '';
        return `<div class="activity-row" data-activity-player="${uuid}" title="${escHtml(playerLabel(uuid))} filtern">
      ${pAv(uuid, 15)}
      <span class="act-name">${escHtml(playerLabel(uuid))}${botTag}</span>
      <div class="act-bar-bg"><div class="act-bar-fill" style="width:${Math.round(cnt/maxAct*100)}%;background:${COLORS[i%COLORS.length]}"></div></div>
      <span class="act-count">${cnt}</span>
    </div>`;
    }).join(''));
}

function buildTaskProgress(log) {
    const allAssigned = new Set(), allDone = new Set(), allFailed = new Set();
    log.forEach(e => {
        if (e.type === 'task_assigned') allAssigned.add(e.data?.task);
        if (e.type === 'task_completed') allDone.add(e.data?.task);
        if (e.type === 'task_failed') allFailed.add(e.data?.task);
    });
    const totalPct = allAssigned.size > 0 ? Math.round(allDone.size / allAssigned.size * 100) : 0;
    setHTML('task-progress', `
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;" class="mono">
      <span class="t3" style="font-size:.6rem;">GESAMT</span><span class="c-green" style="font-size:.6rem;">${allDone.size}/${allAssigned.size} (${totalPct}%)</span>
    </div>
    <div class="task-bar" style="height:7px;margin-bottom:8px;"><div class="task-bar-fill" style="width:${totalPct}%"></div></div>
    <div>${[...allAssigned].sort().map(task => {
        const done = allDone.has(task), fail = allFailed.has(task);
        return `<div class="task-row">
        <span class="task-icon" style="color:${done ? 'var(--safe)' : (fail ? 'var(--warn)' : 'var(--t4)')}">${done ? '✓' : (fail ? '✗' : '○')}</span>
        <span class="task-name${done ? ' done' : (fail ? ' fail' : '')}">${escHtml(task?.replace(/_/g,' ') || '?')}</span>
      </div>`;
    }).join('')}</div>`);
}

function buildVentSection(log, createdAt) {
    const ventSessions = {};
    log.filter(e => ['enter_vent','switch_vent','exit_vent','start_creating_vent','finish_creating_vent','failed_creating_vent'].includes(e.type)).forEach(e => {
        const u = e.data?.player; if (!u) return;
        if (!ventSessions[u]) ventSessions[u] = [];
        ventSessions[u].push(e);
    });
    const ventDiv = getEl('vent-section');
    if (!ventDiv) return;
    if (Object.keys(ventSessions).length === 0) {
        ventDiv.innerHTML = `<div class="empty-state">Keine Vent-Aktivität</div>`;
    } else {
        ventDiv.innerHTML = Object.entries(ventSessions).map(([uuid, evts]) => {
            const enters = evts.filter(e => e.type === 'enter_vent').length;
            const switches = evts.filter(e => e.type === 'switch_vent').length;
            const exits = evts.filter(e => e.type === 'exit_vent').length;
            const creates = evts.filter(e => e.type === 'finish_creating_vent').length;
            return `<div class="vent-session">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
          ${pChip(uuid)}
          <span class="mono t3" style="font-size:.58rem;margin-left:auto;">↘${enters} ⇄${switches} ↗${exits}${creates > 0 ? ` 🔨${creates}` : ''}</span>
        </div>
        ${evts.slice(0, 10).map(ev => {
                const d = ev.data || {};
                if (ev.type === 'enter_vent') return `<div class="vent-line">↘ ${fmtRelative(ev.timestamp, createdAt)} (${d.location?.x},${d.location?.z}) g${d.ventGroup}</div>`;
                if (ev.type === 'switch_vent') return `<div class="vent-line">⇄ (${d.from?.x},${d.from?.z})→(${d.to?.x},${d.to?.z})</div>`;
                if (ev.type === 'exit_vent') return `<div class="vent-line">↗ ${fmtRelative(ev.timestamp, createdAt)} (${d.location?.x},${d.location?.z})</div>`;
                if (ev.type === 'start_creating_vent') return `<div class="vent-line" style="color:var(--warn);">🔨 erstellt… (${d.location?.x},${d.location?.z})</div>`;
                if (ev.type === 'finish_creating_vent') return `<div class="vent-line" style="color:var(--safe);">🔨 fertig (${d.location?.x},${d.location?.z})</div>`;
                if (ev.type === 'failed_creating_vent') return `<div class="vent-line" style="color:var(--danger);">🔨 fehlgeschlagen</div>`;
                return '';
            }).join('')}
        ${evts.length > 10 ? `<div class="vent-line t4">…+${evts.length-10} weitere</div>` : ''}
      </div>`;
        }).join('');
    }
}

function buildAbilities(log, createdAt, players) {
    const abilityTypes = CATEGORIES.ability;
    const abilityEvts = log.filter(e => abilityTypes.includes(e.type));
    if (abilityEvts.length === 0) return;
    setStyle('abilities-section','display','');
    const icons = {
        arsonist_douse: '🔥', camouflage_mode_activated: '🫥', cannibal_eat_body: '🦴',
        reveal_team: '🔮', enter_ghost_form: '👻', exit_ghost_form: '👻',
        start_morph: '🎭', end_morph: '🎭', snitch_one_task_left: '🔔',
        snitch_finished_tasks: '🔔', executioner_target_selected: '⚖',
    };
    setHTML('abilities-content', abilityEvts.map(e => {
        const desc = describeEvent(e);
        return `<div class="ability-entry">
      <span class="ability-icon">${icons[e.type] || '★'}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:.76rem;color:var(--t2);">${desc.text}</div>
        ${desc.extra ? `<div class="tl-extra" style="margin-top:2px;">${desc.extra}</div>` : ''}
      </div>
      <span class="ability-time">${fmtRelative(e.timestamp, createdAt)}</span>
    </div>`;
    }).join(''));
}

function buildSettings(log) {
    const settingsEvts = log.filter(e => e.type === 'settings_change');
    if (settingsEvts.length === 0) return;
    setStyle('settings-section','display','');
    const fs = {};
    settingsEvts.forEach(e => {
        if (!fs[e.data.id]) fs[e.data.id] = { first: e.data.old, last: e.data.new, changes: 0 };
        fs[e.data.id].last = e.data.new; fs[e.data.id].changes++;
    });
    setHTML('settings-changes', Object.entries(fs).map(([k, v]) =>
        `<div class="setting-row">
      <div class="setting-key">${escHtml(k)}</div>
      <div class="setting-old">${escHtml(v.first)}</div>
      <div class="mono t3" style="font-size:.7rem;">→</div>
      <div class="setting-new">${escHtml(v.last)}</div>
      ${v.changes > 1 ? `<div class="mono t4" style="font-size:.56rem;">(×${v.changes})</div>` : ''}
    </div>`).join(''));
}

function buildMeetings(log, players, createdAt) {
    const meetingCalls = log.filter(e => e.type === 'meeting_called');
    const meetingsDiv = getEl('meetings-section');
    if (!meetingsDiv) return;
    if (meetingCalls.length === 0) { meetingsDiv.innerHTML = `<div class="empty-state">Keine Meetings abgehalten</div>`; return; }
    meetingsDiv.innerHTML = meetingCalls.map((mc, i) => {
        const d = mc.data || {};
        const nextM = meetingCalls[i+1];
        const after = ts => new Date(ts) > new Date(mc.timestamp) && (!nextM || new Date(ts) < new Date(nextM.timestamp));
        const votes = log.filter(e => (e.type === 'meeting_vote_for' || e.type === 'meeting_vote_skip') && after(e.timestamp));
        const result = log.find(e => e.type === 'meeting_result' && after(e.timestamp));
        const ejected = result?.data?.ejected;
        const wasImp = ejected ? isImposterRole(players[ejected]?.role) : null;
        return `<div class="meeting-card" data-meeting-idx="${i}">
      <div class="meeting-no">MTG #${i+1} · ${d.reason || '?'} · ${fmtRelative(mc.timestamp, createdAt)}</div>
      <div style="font-size:.76rem;margin-bottom:4px;">
        ${d.reason === 'BODY' ? `🔴 ${pChip(d.caller)} meldete Leiche` : `🔵 ${pChip(d.caller)} Notfall`}
        ${d.body ? ` · Opfer: ${pChip(d.body)}` : ''}
      </div>
      ${votes.length > 0 ? `<div style="margin-bottom:4px;">${votes.slice(0,4).map(v => `<div class="vote-row">${pChip(v.data.voter)} <span class="vote-arrow">→</span> ${v.type === 'meeting_vote_skip' ? '<span class="t3">SKIP</span>' : pChip(v.data.target)}${v.data.mayorVote ? '<span class="c-orange mono" style="font-size:.55rem;margin-left:2px;">M</span>' : ''}</div>`).join('')}${votes.length > 4 ? `<div class="mono t4" style="font-size:.58rem;">+${votes.length-4} weitere</div>` : ''}</div>` : ''}
      ${result ? `<div style="padding-top:4px;border-top:1px solid var(--border);font-size:.72rem;">
        ${ejected ? `<span class="c-red">⚡ ${pChip(ejected)} rausgeworfen</span> <span class="mono t4" style="font-size:.56rem;">${wasImp ? '✓ Imp' : '✗ Crew'}</span>` : `<span class="t3">∅ Kein Rauswurf</span>`}
      </div>` : ''}
    </div>`;
    }).join('');
}

function buildInsights(players, log, createdAt, startEvt) {
    const allUuids = Object.keys(players);
    const ins = [];

    const impostors = allUuids.filter(u => isImposterRole(players[u].role));
    if (impostors.length > 0) ins.push({ type:'danger', text:`🔴 Impostoren (${impostors.length}): ${impostors.map(u => `<strong class="c-red">${escHtml(playerLabel(u))}</strong>`).join(', ')}` });

    const bots = allUuids.filter(u => players[u].isBot);
    if (bots.length > 0) ins.push({ type:'info', text:`🤖 Bots (${bots.length}): ${bots.map(u => pChip(u)).join(' ')}` });

    log.filter(e => e.type === 'player_death' && typeof e.data?.reason === 'object' && e.data.reason.type === 'murdered').forEach(e => {
        ins.push({ type:'murder', text:`⚔ ${pChip(e.data.reason.killer)} mordete ${pChip(e.data.player)} <span class="mono t4" style="font-size:.6rem;">@ ${fmtRelative(e.timestamp, createdAt)}</span>` });
    });

    const firstKill = log.find(e => e.type === 'player_death' && typeof e.data?.reason === 'object');
    if (firstKill && startEvt) ins.push({ type:'warn', text:`⏱ Erster Mord <strong>${fmtDuration(new Date(firstKill.timestamp) - new Date(startEvt.timestamp))}</strong> nach Spielstart` });

    impostors.forEach(imp => {
        const kills = log.filter(e => e.type === 'player_death' && typeof e.data?.reason === 'object' && e.data.reason.killer === imp);
        if (kills.length > 1) {
            const gaps = kills.slice(1).map((k,i) => new Date(k.timestamp) - new Date(kills[i].timestamp));
            ins.push({ type:'danger', text:`⚔ ${pChip(imp)} tötete ${kills.length}× · Ø ${fmtDuration(gaps.reduce((a,b) => a+b,0)/gaps.length)} zwischen Kills` });
        }
    });

    log.filter(e => e.type === 'meeting_result' && e.data?.ejected).forEach(e => {
        const ej = e.data.ejected, wasImp = isImposterRole(players[ej]?.role);
        ins.push({ type: wasImp ? 'success' : 'warn', text: wasImp ? `✅ ${pChip(ej)} korrekt rausgeworfen (Impostor)` : `❌ ${pChip(ej)} fälschlicherweise rausgeworfen (${players[ej]?.role || 'Crew'})` });
    });

    log.filter(e => e.type === 'meeting_result' && !e.data?.ejected).forEach(() => ins.push({ type:'neutral', text:`🤷 Meeting endete ohne Rauswurf` }));

    log.filter(e => e.type === 'start_sabotage').forEach(s => {
        const end = log.find(e => e.type === 'end_sabotage' && e.data?.sabotage === s.data?.sabotage && new Date(e.timestamp) > new Date(s.timestamp));
        if (end) ins.push({ type: end.data.fixed ? 'info' : 'warn', text: end.data.fixed ? `🔧 <strong>${escHtml(s.data?.sabotage?.replace(/_/g,' '))}</strong> repariert in ${fmtDuration(new Date(end.timestamp) - new Date(s.timestamp))}` : `💥 <strong>${escHtml(s.data?.sabotage?.replace(/_/g,' '))}</strong> abgelaufen nach ${fmtDuration(new Date(end.timestamp) - new Date(s.timestamp))}` });
    });

    const ventCounts = {};
    log.filter(e => e.type === 'enter_vent').forEach(e => { ventCounts[e.data.player] = (ventCounts[e.data.player]||0)+1; });
    Object.entries(ventCounts).forEach(([u,c]) => { if(c >= 2) ins.push({ type:'warn', text:`🕳 ${pChip(u)} benutzte Vents <strong>${c}×</strong>` }); });

    const arsonists = allUuids.filter(u => players[u].dousedTargets.length > 0);
    arsonists.forEach(u => ins.push({ type:'danger', text:`🔥 ${pChip(u)} übergoss ${players[u].dousedTargets.length} Ziele: ${players[u].dousedTargets.map(t => pChip(t)).join(' ')}` }));

    const executioners = allUuids.filter(u => players[u].executionerTarget);
    executioners.forEach(u => ins.push({ type:'neutral', text:`⚖ ${pChip(u)} (Vollstrecker) Ziel: ${pChip(players[u].executionerTarget)}` }));

    const snitches = allUuids.filter(u => players[u].snitchFinished);
    snitches.forEach(u => ins.push({ type:'info', text:`🔔 ${pChip(u)} (Snitch) hat alle Tasks abgeschlossen` }));

    const disconnected = allUuids.filter(u => players[u].disconnects > 0);
    disconnected.forEach(u => ins.push({ type:'neutral', text:`⚡ ${pChip(u)} trennte die Verbindung ${players[u].disconnects}×` }));

    const survivors = allUuids.filter(u => !players[u].dead);
    if (survivors.length > 0) ins.push({ type:'success', text:`🛡 Überlebende (${survivors.length}): ${survivors.map(u => pChip(u)).join(' ')}` });

    const startEvtObj = log.find(e => e.type === 'game_start'), endEvtObj = log.find(e => e.type === 'game_end');
    if (startEvtObj && endEvtObj) ins.push({ type:'info', text:`⏱ Spieldauer: <strong>${fmtDuration(new Date(endEvtObj.timestamp) - new Date(startEvtObj.timestamp))}</strong>` });

    setHTML('insights-section', ins.length
        ? ins.map(i => `<div class="insight-item ${i.type}">${i.text}</div>`).join('')
        : `<div class="empty-state">Keine Erkenntnisse</div>`);
}

function buildChat(log, createdAt) {
    const chatEvts = log.filter(e => e.type === 'player_chat' || e.type === 'player_chat_failed');
    const chatDiv = getEl('chat-section');
    if (!chatDiv) return;
    if (chatEvts.length === 0) { chatDiv.innerHTML = `<div class="empty-state">Keine Nachrichten</div>`; return; }
    chatDiv.innerHTML = chatEvts.map(e => {
        const isFailed = e.type === 'player_chat_failed';
        const t = e.data?.type || (isFailed ? 'failed' : '');
        const badgeCls = t === 'meeting' ? 'ct-meeting' : (t === 'ghost' ? 'ct-ghost' : 'ct-failed');
        return `<div class="chat-msg ${t === 'ghost' ? 'ghost-msg' : (isFailed ? 'failed-msg' : '')}">
      <div style="flex-shrink:0;margin-top:1px;">${pAv(e.data?.player, 16)}</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:1px;">
          <span class="chat-sender">${escHtml(playerLabel(e.data?.player))}</span>
          ${t ? `<span class="ct-badge ${badgeCls}">${t.toUpperCase()}</span>` : ''}
          <span class="chat-time" style="margin-left:auto;">${fmtRelative(e.timestamp, createdAt)}</span>
        </div>
        <div class="chat-text">${isFailed ? '<span class="t4">[blockiert] </span>' : ''}${escHtml(e.data?.message || '')}</div>
      </div>
    </div>`;
    }).join('');
}

function buildTimeline(log, createdAt, allUuids, players) {
    const allCats = [...new Set(log.map(e => getCat(e.type)))];
    activeFilt = new Set(allCats);

    const filterBar = getEl('filter-bar');
    if (!filterBar) return;
    filterBar.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'chip-btn active'; allBtn.id = 'filter-all'; allBtn.textContent = 'ALL';
    filterBar.appendChild(allBtn);

    allCats.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'chip-btn active'; btn.textContent = cat.toUpperCase(); btn.dataset.cat = cat;
        filterBar.appendChild(btn);
    });

    filterBar.addEventListener('click', ev => {
        const btn = ev.target.closest('.chip-btn');
        if (!btn) return;
        if (btn.id === 'filter-all') {
            const allOn = activeFilt.size === allCats.length;
            if (allOn) { activeFilt.clear(); filterBar.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active')); }
            else { allCats.forEach(c => activeFilt.add(c)); filterBar.querySelectorAll('.chip-btn').forEach(b => b.classList.add('active')); }
        } else {
            const cat = btn.dataset.cat;
            activeFilt.has(cat) ? activeFilt.delete(cat) : activeFilt.add(cat);
            btn.classList.toggle('active', activeFilt.has(cat));
            const fa = getEl('filter-all');
            if (fa) fa.classList.toggle('active', activeFilt.size === allCats.length);
        }
        renderTimeline();
    });

    const searchInp = getEl('tl-search');
    if (searchInp) searchInp.addEventListener('input', () => { searchQuery = searchInp.value.trim(); renderTimeline(); });

    const regexBtn = getEl('regex-btn');
    if (regexBtn) regexBtn.addEventListener('click', () => { useRegex = !useRegex; regexBtn.classList.toggle('active', useRegex); renderTimeline(); });

    const pfSel = getEl('pf-select');
    if (pfSel) pfSel.addEventListener('change', () => {
        playerFilterUuids.clear();
        if (pfSel.value) playerFilterUuids.add(pfSel.value);
        document.querySelectorAll('.player-card').forEach(c => c.classList.toggle('player-focused', playerFilterUuids.has(c.dataset.playerCard)));
        renderTimeline();
    });

    const pfRoleSel = getEl('pf-role-select');
    if (pfRoleSel) pfRoleSel.addEventListener('change', () => { roleFilter = pfRoleSel.value; renderTimeline(); });

    const sortAscBtn = getEl('sort-asc');
    const sortDescBtn = getEl('sort-desc');
    if (sortAscBtn) sortAscBtn.addEventListener('click', () => {
        sortAsc = true; sortAscBtn.classList.add('active'); sortDescBtn?.classList.remove('active'); renderTimeline();
    });
    if (sortDescBtn) sortDescBtn.addEventListener('click', () => {
        sortAsc = false; sortDescBtn.classList.add('active'); sortAscBtn?.classList.remove('active'); renderTimeline();
    });

    renderTimeline();
}

function filterToPlayer(uuid) {
    if (uuid) {
        playerFilterUuids.clear();
        playerFilterUuids.add(uuid);
    } else {
        playerFilterUuids.clear();
    }
    const pfSel = getEl('pf-select');
    if (pfSel && pfSel.value !== uuid) pfSel.value = uuid || '';
    document.querySelectorAll('.player-card').forEach(c => c.classList.toggle('player-focused', playerFilterUuids.has(c.dataset.playerCard)));
    renderTimeline();
}

function soloFilter(cat) {
    activeFilt.clear(); activeFilt.add(cat);
    document.querySelectorAll('.chip-btn').forEach(b => { b.classList.toggle('active', b.dataset.cat === cat); });
    const fa = getEl('filter-all'); if (fa) fa.classList.remove('active');
    renderTimeline();
}

function buildSearchMatcher(q) {
    if (!q) return null;
    if (useRegex) {
        try { return new RegExp(q, 'i'); } catch { return null; }
    }
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return null;
    return { terms };
}

function matchesSearch(e, matcher) {
    if (!matcher) return true;
    const hay = (JSON.stringify(e) + ' ' + playerLabel((e.data || {}).player || '') + ' ' + playerLabel((e.data || {}).caller || '') + ' ' + playerLabel((e.data || {}).voter || '') + ' ' + (e.data?.message || '')).toLowerCase();
    if (matcher instanceof RegExp) return matcher.test(hay);
    return matcher.terms.every(t => hay.includes(t));
}

function highlightText(html, q) {
    if (!q) return html;
    try {
        if (useRegex) {
            const rx = new RegExp(q, 'gi');
            return html.replace(rx, m => `<mark>${m}</mark>`);
        }
        const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
        let result = html;
        terms.forEach(t => {
            const rx = new RegExp(escHtml(t).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi');
            result = result.replace(rx, m => `<mark>${m}</mark>`);
        });
        return result;
    } catch { return html; }
}

function renderTimeline() {
    const tl = getEl('timeline');
    if (!tl || !G.log) return;

    const matcher = buildSearchMatcher(searchQuery);

    let filtered = G.log.map((e, i) => ({ e, i })).filter(({ e }) => {
        if (!activeFilt.has(getCat(e.type))) return false;
        if (playerFilterUuids.size > 0) {
            const evUuids = eventUuids(e);
            if (![...playerFilterUuids].some(u => evUuids.has(u))) return false;
        }
        if (roleFilter) {
            const evUuids = [...eventUuids(e)];
            if (roleFilter === 'impostor') {
                if (!evUuids.some(u => isImposterRole(G.players[u]?.role))) return false;
            } else if (roleFilter === 'crewmate') {
                if (!evUuids.some(u => !isImposterRole(G.players[u]?.role) && !G.players[u]?.isBot && G.players[u]?.role)) return false;
            } else if (roleFilter === 'bot') {
                if (!evUuids.some(u => G.players[u]?.isBot)) return false;
            }
        }
        if (!matchesSearch(e, matcher)) return false;
        return true;
    });

    if (!sortAsc) filtered = filtered.reverse();

    setHTML('tl-count', `${filtered.length} / ${G.log.length} Events`);
    tl.innerHTML = '';

    if (filtered.length === 0) { tl.innerHTML = `<div class="empty-state">Keine Events gefunden</div>`; return; }

    const BATCH = 200;
    const frag = document.createDocumentFragment();
    filtered.slice(0, BATCH).forEach(({ e, i }, arrIdx) => {
        const cat = getCat(e.type);
        const desc = describeEvent(e);
        const wrap = document.createElement('div');
        wrap.className = 'tl-entry'; wrap.dataset.evtIdx = i;
        wrap.style.animationDelay = `${Math.min(arrIdx * 4, 200)}ms`;
        const rawJson = JSON.stringify(e, null, 2);

        const descText = searchQuery ? highlightText(desc.text, searchQuery) : desc.text;

        wrap.innerHTML = `
      <div class="tl-left">
        <div class="tl-dot dot-${cat}"></div>
        <div class="tl-line"></div>
      </div>
      <div class="tl-body">
        <div class="tl-header">
          <span class="tl-time">${fmtRelative(e.timestamp, G.createdAt)}</span>
          <span class="tl-cat cat-${cat}" data-filter-cat="${cat}">${cat}</span>
          <span class="tl-desc">${descText}</span>
        </div>
        ${desc.extra ? `<div class="tl-extra">${desc.extra}</div>` : ''}
        <div class="tl-raw">${escHtml(rawJson)}</div>
      </div>`;
        frag.appendChild(wrap);
    });
    tl.appendChild(frag);

    if (filtered.length > BATCH) {
        const more = document.createElement('div');
        more.className = 'empty-state';
        more.style.textAlign = 'center';
        more.style.padding = '.8rem';
        more.innerHTML = `<span>…weitere ${filtered.length - BATCH} Events — Filter verfeinern um mehr anzuzeigen</span>`;
        tl.appendChild(more);
    }
}

function openPlayerModal(uuid) {
    const p = G.players?.[uuid];
    if (!p) return;
    const log = G.log, createdAt = G.createdAt;
    ensureModals();
    const overlay = getEl('player-modal-overlay');
    const content = getEl('player-modal-content');
    if (!overlay || !content) return;

    const isImp = isImposterRole(p.role);
    const pct = p.tasks.assigned.size > 0 ? Math.round(p.tasks.completed.size / p.tasks.assigned.size * 100) : 0;
    let timeAlive = '';
    if (p.dead && p.deadTs) {
        const startEvt = log.find(e => e.type === 'game_start');
        if (startEvt) timeAlive = fmtDuration(new Date(p.deadTs) - new Date(startEvt.timestamp));
    }
    const myEvents = log.filter(e => eventUuids(e).has(uuid));
    const myKills = log.filter(e => e.type === 'player_death' && typeof e.data?.reason === 'object' && e.data.reason.killer === uuid);
    const myAbilities = myEvents.filter(e => getCat(e.type) === 'ability');
    const mayorVotes = p.votes.filter(v => v.mayor).length;

    content.innerHTML = `
    <div class="modal-header" style="position:relative;">
      <img class="modal-avatar" src="${getAvatarUrl(uuid)}" alt="" onerror="this.style.opacity=.3">
      <div style="flex:1;min-width:0;">
        <div class="modal-name" style="color:${isImp ? 'var(--danger)' : 'var(--t1)'}">${escHtml(playerLabel(uuid))}${p.isBot ? ' <span style="color:var(--safe);font-size:.8rem;">🤖 BOT</span>' : ''}</div>
        <div class="modal-uuid">${uuid}</div>
        <div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:4px;">
          <span class="role-badge ${isImp ? 'rb-imp' : (p.role ? 'rb-crew' : (p.isBot ? 'rb-bot' : 'rb-other'))}">${escHtml(p.role || 'unbekannt')}</span>
          ${p.wasHost ? `<span class="role-badge" style="background:rgba(255,170,0,.14);color:var(--warn);border:1px solid rgba(255,170,0,.3);">HOST</span>` : ''}
          ${p.dead ? `<span class="role-badge" style="background:rgba(255,40,72,.14);color:var(--danger);border:1px solid rgba(255,40,72,.3);">DEAD</span>` : `<span class="role-badge" style="background:rgba(0,230,118,.12);color:var(--safe);border:1px solid rgba(0,230,118,.25);">ALIVE</span>`}
          ${p.modifications.map(m => `<span class="role-badge rb-other">${escHtml(m)}</span>`).join('')}
        </div>
      </div>
      <button class="modal-close" id="player-modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-stat-grid">
        ${[
        { val: p.tasks.assigned.size, lbl: 'Tasks', col: 'var(--t2)' },
        { val: p.tasks.completed.size, lbl: 'Done', col: 'var(--safe)' },
        { val: p.tasks.failed.size, lbl: 'Failed', col: 'var(--warn)' },
        { val: myKills.length, lbl: 'Kills', col: 'var(--danger)' },
        { val: p.meetings.called, lbl: 'Meetings', col: 'var(--purple)' },
        { val: p.meetings.bodyReports, lbl: 'Reports', col: 'var(--danger)' },
        { val: p.votes.length, lbl: 'Votes', col: 'var(--accent)' },
        { val: mayorVotes, lbl: 'Mayor', col: 'var(--warn)' },
        { val: p.vents, lbl: 'Vents', col: '#22d3ee' },
        { val: p.cameras, lbl: 'Cameras', col: '#34d399' },
        { val: p.sabotages, lbl: 'Sabotages', col: '#ff6600' },
        { val: p.morphs, lbl: 'Morphs', col: 'var(--pink)' },
        { val: p.ghostForms, lbl: 'Ghost', col: 'var(--t3)' },
        { val: p.camouflages, lbl: 'Camo', col: 'var(--purple)' },
        { val: p.chat.length, lbl: 'Chat', col: 'var(--t2)' },
        { val: p.disconnects, lbl: 'DC', col: 'var(--warn)' },
    ].filter(s => s.val > 0 || ['Tasks','Done','Kills','Meetings','Votes','Chat'].includes(s.lbl))
        .map(s => `<div class="modal-stat"><div class="modal-stat-val" style="color:${s.col}">${s.val}</div><div class="modal-stat-lbl">${s.lbl}</div></div>`).join('')}
      </div>

      ${p.tasks.assigned.size > 0 ? `
        <div class="modal-section">Task-Fortschritt</div>
        <div style="display:flex;justify-content:space-between;" class="mono" style="font-size:.62rem;">
          <span class="t3">PROGRESS</span><span class="c-green">${p.tasks.completed.size}/${p.tasks.assigned.size} (${pct}%)</span>
        </div>
        <div class="task-bar" style="height:7px;margin-bottom:8px;"><div class="task-bar-fill" style="width:${pct}%"></div></div>
        <div>${[...p.tasks.assigned].sort().map(t => {
        const done = p.tasks.completed.has(t), fail = p.tasks.failed.has(t);
        return `<div class="task-row"><span class="task-icon" style="color:${done ? 'var(--safe)' : (fail ? 'var(--warn)' : 'var(--t4)')}">${done ? '✓' : (fail ? '✗' : '○')}</span><span class="task-name${done ? ' done' : (fail ? ' fail' : '')}">${escHtml(t.replace(/_/g,' '))}</span></div>`;
    }).join('')}</div>
      ` : ''}

      ${p.dead ? `
        <div class="modal-section">Tod</div>
        <div style="font-size:.8rem;color:var(--t2);">
          ${p.deadReason === 'murdered' && p.killer
        ? `⚔ Ermordet von ${pChip(p.killer)}${timeAlive ? ` · überlebte <strong>${timeAlive}</strong>` : ''}`
        : `Ursache: <strong>${p.deadReason || 'unbekannt'}</strong>${timeAlive ? ` · überlebte <strong>${timeAlive}</strong>` : ''}`}
        </div>` : ''}

      ${myKills.length > 0 ? `
        <div class="modal-section">Kills (${myKills.length})</div>
        <div>${myKills.map(e => `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:.78rem;color:var(--t2);">
          ⚔ ${pChip(e.data.player)} <span class="mono t3" style="font-size:.6rem;">${fmtRelative(e.timestamp, createdAt)}</span>
        </div>`).join('')}</div>
      ` : ''}

      ${p.dousedTargets.length > 0 ? `
        <div class="modal-section">Übergossene Ziele 🔥 (${p.dousedTargets.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">${p.dousedTargets.map(t => pChip(t)).join('')}</div>
      ` : ''}

      ${p.executionerTarget ? `
        <div class="modal-section">Vollstrecker-Ziel ⚖</div>
        <div>${pChip(p.executionerTarget)}</div>
      ` : ''}

      ${p.votes.length > 0 ? `
        <div class="modal-section">Voting (${p.votes.length})</div>
        <div>${p.votes.map(v => `<div style="font-size:.76rem;padding:2px 0;color:var(--t2);display:flex;align-items:center;gap:4px;">→ ${pChip(v.target)}${v.mayor ? '<span class="mono c-orange" style="font-size:.56rem;">MAYOR</span>' : ''} <span class="mono t3" style="font-size:.6rem;">${fmtRelative(v.ts, createdAt)}</span></div>`).join('')}</div>
      ` : ''}

      ${myAbilities.length > 0 ? `
        <div class="modal-section">Sonderfähigkeiten (${myAbilities.length})</div>
        <div>${myAbilities.map(e => {
        const desc = describeEvent(e);
        return `<div style="font-size:.76rem;padding:2px 0;color:var(--t2);">${desc.text} <span class="mono t3" style="font-size:.58rem;">${fmtRelative(e.timestamp, createdAt)}</span></div>`;
    }).join('')}</div>
      ` : ''}

      ${p.chat.length > 0 ? `
        <div class="modal-section">Chat (${p.chat.length})</div>
        <div>${p.chat.map(c => {
        const badgeCls = c.type === 'meeting' ? 'ct-meeting' : (c.type === 'ghost' ? 'ct-ghost' : 'ct-failed');
        return `<div class="chat-msg ${c.type === 'ghost' ? 'ghost-msg' : (c.type === 'failed' ? 'failed-msg' : '')}">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:1px;">
              ${c.type ? `<span class="ct-badge ${badgeCls}">${c.type.toUpperCase()}</span>` : ''}
              <span class="chat-time" style="margin-left:auto;">${fmtRelative(c.ts, createdAt)}</span>
            </div>
            <div class="chat-text">${escHtml(c.msg || '')}</div>
          </div>
        </div>`;
    }).join('')}</div>
      ` : ''}

      <div class="modal-section">Alle Events (${myEvents.length})</div>
      <div class="scroll-panel" style="max-height:260px;">
        ${myEvents.slice(0, 80).map(e => {
        const cat = getCat(e.type); const desc = describeEvent(e);
        return `<div class="tl-entry" style="animation:none;">
            <div class="tl-left"><div class="tl-dot dot-${cat}" style="margin-top:5px;"></div><div class="tl-line"></div></div>
            <div class="tl-body">
              <div class="tl-header">
                <span class="tl-time">${fmtRelative(e.timestamp, createdAt)}</span>
                <span class="tl-cat cat-${cat}">${cat}</span>
                <span class="tl-desc">${desc.text}</span>
              </div>
              ${desc.extra ? `<div class="tl-extra">${desc.extra}</div>` : ''}
            </div>
          </div>`;
    }).join('')}
        ${myEvents.length > 80 ? `<div class="empty-state">+${myEvents.length-80} weitere Events…</div>` : ''}
      </div>

      <div style="margin-top:.85rem;padding-top:.75rem;border-top:1px solid var(--border);">
        <button onclick="filterToPlayer('${uuid}');closePlayerModal();" style="width:100%;background:rgba(0,200,255,.07);border:1px solid rgba(0,200,255,.25);color:var(--accent);border-radius:var(--r-sm);padding:.42rem .7rem;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:.64rem;letter-spacing:.06em;transition:all .12s;">
          ⌕ TIMELINE AUF DIESEN SPIELER FILTERN
        </button>
      </div>
    </div>`;

    overlay.classList.add('open');
    getEl('player-modal-close').onclick = closePlayerModal;
}

function closePlayerModal() { const el = getEl('player-modal-overlay'); if (el) el.classList.remove('open'); }

function openMeetingDetail(idx) {
    const log = G.log; if (!log) return;
    const meetingCalls = log.filter(e => e.type === 'meeting_called');
    const mc = meetingCalls[idx]; if (!mc) return;
    const nextM = meetingCalls[idx+1];
    const after = ts => new Date(ts) > new Date(mc.timestamp) && (!nextM || new Date(ts) < new Date(nextM.timestamp));
    const votes = log.filter(e => (e.type === 'meeting_vote_for' || e.type === 'meeting_vote_skip') && after(e.timestamp));
    const result = log.find(e => e.type === 'meeting_result' && after(e.timestamp));
    const chatInM = log.filter(e => e.type === 'player_chat' && after(e.timestamp) && e.data?.type === 'meeting');
    const discS = log.find(e => e.type === 'phase_change' && e.data?.new === 'DISCUSSION' && after(e.timestamp));
    const voteS = log.find(e => e.type === 'phase_change' && e.data?.new === 'VOTING' && after(e.timestamp));
    const endS = log.find(e => e.type === 'phase_change' && e.data?.new === 'ENDING_MEETING' && after(e.timestamp));

    ensureModals();
    const overlay = getEl('evtd-overlay');
    const evtdContent = getEl('evtd-content');
    if (!overlay || !evtdContent) return;

    const skipVotes = votes.filter(v => v.type === 'meeting_vote_skip').length;
    const forVotes = votes.filter(v => v.type === 'meeting_vote_for');
    const voteTally = {};
    forVotes.forEach(v => { voteTally[v.data.target] = (voteTally[v.data.target] || 0) + (v.data.mayorVote ? 2 : 1); });
    const topVoted = Object.entries(voteTally).sort((a,b) => b[1]-a[1]);

    evtdContent.innerHTML = `
    <div class="evtd-header">
      <span class="evtd-type">MEETING #${idx+1} · ${mc.data?.reason || '?'}</span>
      <button onclick="closeEvtdModal()" class="modal-close">✕</button>
    </div>
    <div class="evtd-body">
      <div class="evtd-row"><div class="evtd-key">Aufgerufen von</div><div class="evtd-val">${pChip(mc.data?.caller)}</div></div>
      <div class="evtd-row"><div class="evtd-key">Grund</div><div class="evtd-val">${mc.data?.reason}</div></div>
      ${mc.data?.body ? `<div class="evtd-row"><div class="evtd-key">Leiche</div><div class="evtd-val">${pChip(mc.data.body)}</div></div>` : ''}
      <div class="evtd-row"><div class="evtd-key">Zeitpunkt</div><div class="evtd-val">${fmtRelative(mc.timestamp, G.createdAt)}</div></div>
      ${discS && voteS ? `<div class="evtd-row"><div class="evtd-key">Diskussion</div><div class="evtd-val">${fmtDuration(new Date(voteS.timestamp)-new Date(discS.timestamp))}</div></div>` : ''}
      ${voteS && endS ? `<div class="evtd-row"><div class="evtd-key">Voting</div><div class="evtd-val">${fmtDuration(new Date(endS.timestamp)-new Date(voteS.timestamp))}</div></div>` : ''}
      ${topVoted.length > 0 ? `<div class="evtd-row" style="flex-direction:column;align-items:flex-start;gap:3px;"><div class="evtd-key">Stimmverteilung</div><div>${topVoted.map(([t,c]) => `<div class="vote-row">${pChip(t)} <span class="mono t2" style="font-size:.7rem;margin-left:4px;">${c} Stimme${c!==1?'n':''}</span></div>`).join('')}</div></div>` : ''}
      ${skipVotes > 0 ? `<div class="evtd-row"><div class="evtd-key">Skips</div><div class="evtd-val">${skipVotes}</div></div>` : ''}
      ${votes.length > 0 ? `<div class="evtd-row" style="flex-direction:column;align-items:flex-start;gap:3px;"><div class="evtd-key">Alle Votes (${votes.length})</div><div>${votes.map(v => `<div class="vote-row">${pChip(v.data.voter)} <span class="vote-arrow">→</span> ${v.type === 'meeting_vote_skip' ? '<span class="t3">SKIP</span>' : pChip(v.data.target)}${v.data.mayorVote ? ' <span class="mono c-orange" style="font-size:.56rem;">MAYOR</span>' : ''}</div>`).join('')}</div></div>` : ''}
      ${chatInM.length > 0 ? `<div class="evtd-row" style="flex-direction:column;align-items:flex-start;gap:3px;"><div class="evtd-key">Chat (${chatInM.length})</div><div>${chatInM.map(c => `<div style="font-size:.74rem;color:var(--t2);padding:1px 0;">${pAv(c.data.player,13)} <span class="t3">${escHtml(playerLabel(c.data.player))}:</span> ${escHtml(c.data.message||'')}</div>`).join('')}</div></div>` : ''}
      ${result ? `<div class="evtd-row"><div class="evtd-key">Ergebnis</div><div class="evtd-val">${result.data.ejected ? `${pChip(result.data.ejected)} rausgeworfen` : '<span class="t3">Kein Rauswurf</span>'}</div></div>` : ''}
    </div>`;
    overlay.classList.add('open');
}

function closeEvtdModal() { const el = getEl('evtd-overlay'); if (el) el.classList.remove('open'); }

function ensureModals() {
    if (!getEl('player-modal-overlay')) {
        const ov = document.createElement('div');
        ov.id = 'player-modal-overlay'; ov.className = 'modal-overlay';
        ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true');
        ov.innerHTML = '<div class="player-modal" id="player-modal-content"></div>';
        document.body.appendChild(ov);
    }
    if (!getEl('evtd-overlay')) {
        const ov2 = document.createElement('div');
        ov2.id = 'evtd-overlay'; ov2.className = 'evtd-overlay';
        ov2.setAttribute('role','dialog'); ov2.setAttribute('aria-modal','true');
        ov2.innerHTML = '<div class="evtd-box" id="evtd-content"></div>';
        document.body.appendChild(ov2);
    }
}

function wireModalEvents() {
    const pmOverlay = getEl('player-modal-overlay');
    const edOverlay = getEl('evtd-overlay');
    if (pmOverlay) pmOverlay.addEventListener('click', e => { if (e.target === e.currentTarget) closePlayerModal(); });
    if (edOverlay) edOverlay.addEventListener('click', e => { if (e.target === e.currentTarget) closeEvtdModal(); });
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closePlayerModal(); closeEvtdModal(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const s = getEl('tl-search'); if (s) { s.focus(); s.select(); }
    }
});