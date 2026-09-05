/**
 * PeerRater - Fair Team Grading Application
 * A collaborative task management and contribution tracking system for student teams
 *
 * Features:
 * - User authentication (team leaders and members)
 * - Team creation and management
 * - Task assignment and point-based contribution tracking
 * - Join request system with invite/join-request workflows
 * - Real-time contribution chart visualization
 * - Team chat functionality
 * - Theme system with multiple color schemes
 * - Profile image management
 * - Printable contribution receipts
 */

// ============================================================================
// CONSTANTS AND CONFIGURATION
// ============================================================================

// LocalStorage keys for data persistence
const ACCOUNTS_KEY = 'peer-rater-accounts';        // User accounts data
const TEAMS_KEY = 'peer-rater-teams';              // Team information
const BOARDS_KEY = 'peer-rater-team-boards';       // Task boards per team
const CURRENT_USER_KEY = 'peer-rater-current-user'; // Currently logged-in user
const REQUESTS_KEY = 'peer-rater-join-requests';    // Team join/invite requests
const THEME_KEY = 'peer-rater-theme';              // User's theme preference

// Default color palette for charts and avatars
const DEFAULT_COLORS = ['#4f46e5', '#22c55e', '#f97316', '#ec4899', '#f59e0b', '#06b6d4', '#8b5cf6', '#ef4444'];

// ============================================================================
// GLOBAL STATE VARIABLES
// ============================================================================

let chartInstance = null;           // Chart.js instance for contribution visualization
let taskBeingEditedIndex = null;     // Index of task currently being edited
let activeChartType = 'pie';         // Current chart type (pie/bar)
let currentTaskFilter = 'all';       // Current task filter (all/completed/pending)

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Safely retrieves JSON data from localStorage
 * @param {string} key - The localStorage key
 * @param {any} fallback - Default value if key doesn't exist or parsing fails
 * @returns {any} Parsed JSON data or fallback value
 */
function getJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

/**
 * Safely stores JSON data in localStorage
 * @param {string} key - The localStorage key
 * @param {any} value - The value to store (will be JSON stringified)
 */
function setJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Generates a unique ID with a given prefix
 * @param {string} prefix - Prefix for the ID (e.g., 'user', 'team', 'task')
 * @returns {string} Unique ID in format 'prefix_randomString'
 */
function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Normalizes text by converting to string and trimming whitespace
 * @param {any} value - Value to normalize
 * @returns {string} Normalized string
 */
function normalizeText(value) {
  return String(value || '').trim();
}

/**
 * Converts text to lowercase slug format
 * @param {string} value - Text to slugify
 * @returns {string} Lowercase slug
 */
function slugify(value) {
  return normalizeText(value).toLowerCase();
}

/**
 * Checks if a team name is already taken
 * @param {string} teamName - Team name to check
 * @param {string|null} excludeTeamId - Team ID to exclude from check (for updates)
 * @returns {boolean} True if team name is taken
 */
function isTeamNameTaken(teamName, excludeTeamId = null) {
  const slug = slugify(teamName);
  if (!slug) {
    return false;
  }
  return readTeams().some((team) => slugify(team.name) === slug && team.id !== excludeTeamId);
}

/**
 * Checks if a username is already taken
 * @param {string} username - Username to check
 * @param {string|null} excludeUserId - User ID to exclude from check (for updates)
 * @returns {boolean} True if username is taken
 */
function isUsernameTaken(username, excludeUserId = null) {
  const slug = slugify(username);
  if (!slug) {
    return false;
  }
  return readAccounts().some((account) => slugify(account.username) === slug && account.id !== excludeUserId);
}

/**
 * Sets visual validation status for form input fields
 * @param {string} fieldId - ID of the input field
 * @param {string} status - Validation status ('valid', 'invalid', or null)
 * @param {string} message - Optional status message to display
 */
function setInputStatus(fieldId, status, message = '') {
  const icon = document.getElementById(fieldId + 'Status');
  const msg = document.getElementById(fieldId + 'Msg');
  const input = document.getElementById(fieldId);

  if (icon) {
    icon.classList.remove('status-valid', 'status-invalid');
    if (status === 'valid') {
      icon.classList.add('status-valid');
    } else if (status === 'invalid') {
      icon.classList.add('status-invalid');
    }
  }

  if (msg) {
    msg.classList.remove('status-valid', 'status-invalid');
    if (status === 'valid') {
      msg.classList.add('status-valid');
    } else if (status === 'invalid') {
      msg.classList.add('status-invalid');
    }
    msg.textContent = message;
  }

  if (input) {
    if (status === 'invalid') {
      input.style.borderColor = 'var(--danger, #ef4444)';
    } else if (status === 'valid') {
      input.style.borderColor = 'var(--success, #22c55e)';
    } else {
      input.style.borderColor = '';
    }
  }
}

/**
 * Reads all join/invite requests from localStorage
 * @returns {Array} Array of request objects
 */
function readRequests() {
  return getJson(REQUESTS_KEY, []);
}

/**
 * Saves requests array to localStorage
 * @param {Array} requests - Array of request objects to save
 */
function saveRequests(requests) {
  setJson(REQUESTS_KEY, requests);
}

/**
 * Formats a date/time value into a readable string
 * @param {string|Date} value - Date value to format
 * @returns {string} Formatted date/time string or 'No deadline'
 */
function formatDateTime(value) {
  if (!value) {
    return 'No deadline';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No deadline';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

/**
 * Checks if a task was completed after its deadline
 * @param {Object} task - Task object with claimedAt and deadline properties
 * @returns {boolean} True if task is late
 */
function isTaskLate(task) {
  if (!task || !task.claimedAt || !task.deadline) {
    return false;
  }
  return new Date(task.claimedAt).getTime() > new Date(task.deadline).getTime();
}

/**
 * Calculates effective points for a task (halved if late)
 * @param {Object} task - Task object with points and deadline info
 * @returns {number} Effective point value
 */
function getTaskEffectivePoints(task) {
  if (!task) {
    return 0;
  }
  const base = Number(task.points) || 0;
  return isTaskLate(task) ? base / 2 : base;
}

/**
 * Reads a file as a Data URL (base64 encoded)
 * @param {File} file - File object to read
 * @returns {Promise<string>} Promise resolving to Data URL string
 */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read image'));
    reader.readAsDataURL(file);
  });
}

/**
 * Generates an SVG avatar based on username and full name
 * @param {string} username - User's username
 * @param {string} fullName - User's full name
 * @returns {string} Data URL of generated avatar SVG
 */
function generateAvatarDataUrl(username, fullName) {
  const initials = (fullName || username || 'P').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'P';
  const seed = String(username || fullName || 'peer').split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const palette = ['#4F46E5', '#22C55E', '#F97316', '#EC4899', '#06B6D4', '#8B5CF6'];
  const color = palette[seed % palette.length];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <rect width="120" height="120" rx="30" fill="${color}"/>
      <circle cx="60" cy="44" r="20" fill="rgba(255,255,255,0.35)"/>
      <path d="M32 92c5-16 19-24 28-24s23 8 28 24" fill="rgba(255,255,255,0.32)"/>
      <text x="60" y="65" text-anchor="middle" font-size="32" font-family="Arial, sans-serif" font-weight="700" fill="white">${initials}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Gets profile photo for an account (returns uploaded image or generates avatar)
 * @param {Object} account - User account object
 * @returns {string} Profile photo Data URL
 */
function getProfilePhoto(account) {
  if (!account) {
    return generateAvatarDataUrl('peer', 'Peer');
  }
  return account.profileImage || generateAvatarDataUrl(account.username, account.fullName || account.username);
}

/**
 * Generates an SVG team logo based on team name
 * @param {string} teamName - Team name
 * @returns {string} Data URL of generated team logo SVG
 */
function generateTeamLogoDataUrl(teamName) {
  const cleanName = String(teamName || 'Team').trim();
  const initials = cleanName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'T';
  const seed = cleanName.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const palette = [
    ['#4F46E5', '#06B6D4'],
    ['#22C55E', '#10B981'],
    ['#F97316', '#F59E0B'],
    ['#EC4899', '#8B5CF6'],
    ['#3B82F6', '#6366F1']
  ];
  const pair = palette[seed % palette.length];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="teamGrad_${seed}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${pair[0]}"/>
          <stop offset="100%" stop-color="${pair[1]}"/>
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="32" fill="url(#teamGrad_${seed})"/>
      <circle cx="60" cy="60" r="42" fill="rgba(255,255,255,0.18)"/>
      <text x="60" y="72" text-anchor="middle" font-size="38" font-family="Inter, Arial, sans-serif" font-weight="800" fill="white" letter-spacing="1">${initials}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Gets team logo (returns uploaded image or generates logo)
 * @param {Object} team - Team object
 * @returns {string} Team logo Data URL
 */
function getTeamLogo(team) {
  if (!team) {
    return generateTeamLogoDataUrl('Peer Team');
  }
  return team.logoImage || generateTeamLogoDataUrl(team.name);
}

// ============================================================================
// DATA MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Reads all user accounts from localStorage
 * @returns {Array} Array of account objects
 */
function readAccounts() {
  return getJson(ACCOUNTS_KEY, []);
}

/**
 * Saves accounts array to localStorage
 * @param {Array} accounts - Array of account objects to save
 */
function saveAccounts(accounts) {
  setJson(ACCOUNTS_KEY, accounts);
}

/**
 * Reads all teams from localStorage
 * @returns {Array} Array of team objects
 */
function readTeams() {
  return getJson(TEAMS_KEY, []);
}

/**
 * Saves teams array to localStorage
 * @param {Array} teams - Array of team objects to save
 */
function saveTeams(teams) {
  setJson(TEAMS_KEY, teams);
}

/**
 * Reads task board for a specific team
 * @param {string} teamId - Team ID
 * @returns {Array} Array of task objects for the team
 */
function readBoard(teamId) {
  const boards = getJson(BOARDS_KEY, {});
  return boards[teamId] || [];
}

/**
 * Saves task board for a specific team
 * @param {string} teamId - Team ID
 * @param {Array} tasks - Array of task objects to save
 */
function saveBoard(teamId, tasks) {
  const boards = getJson(BOARDS_KEY, {});
  boards[teamId] = tasks;
  setJson(BOARDS_KEY, boards);
}

/**
 * Saves team logo from uploaded file
 * @param {File} file - Uploaded image file
 */
async function saveTeamLogoFromFile(file) {
  const currentUser = getCurrentUser();
  const team = getCurrentTeam();
  if (!currentUser || !team || currentUser.role !== 'team-leader' || team.leaderId !== currentUser.id) {
    alert('Only the team leader can change the team logo.');
    return;
  }
  if (!file) {
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl) {
      return;
    }

    const teams = readTeams();
    const targetTeam = teams.find((t) => t.id === team.id);
    if (targetTeam) {
      targetTeam.logoImage = dataUrl;
      saveTeams(teams);
      renderApp();
    }
  } catch (error) {
    alert('Failed to upload team logo image. Please try another image.');
  }
}

/**
 * Removes team logo and reverts to default generated logo
 */
function removeTeamLogo() {
  const currentUser = getCurrentUser();
  const team = getCurrentTeam();
  if (!currentUser || !team || currentUser.role !== 'team-leader' || team.leaderId !== currentUser.id) {
    alert('Only the team leader can remove the team logo.');
    return;
  }

  if (confirm('Are you sure you want to reset the team logo to the default emblem?')) {
    const teams = readTeams();
    const targetTeam = teams.find((t) => t.id === team.id);
    if (targetTeam) {
      delete targetTeam.logoImage;
      saveTeams(teams);
      renderApp();
    }
  }
}

/**
 * Opens the team logo modal dialog
 */
function openTeamLogoModal() {
  const team = getCurrentTeam();
  const currentUser = getCurrentUser();
  const modal = document.getElementById('teamLogoModal');
  const img = document.getElementById('teamLogoModalImg');
  const title = document.getElementById('teamLogoModalTeamName');
  const leaderControls = document.getElementById('teamLogoModalLeaderControls');

  if (!modal || !team) {
    return;
  }

  if (img) {
    img.src = getTeamLogo(team);
  }
  if (title) {
    title.textContent = team.name;
  }

  const isLeader = currentUser && currentUser.role === 'team-leader' && team.leaderId === currentUser.id;
  if (leaderControls) {
    leaderControls.classList.toggle('hidden', !isLeader);
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

/**
 * Closes the team logo modal dialog
 */
function closeTeamLogoModal() {
  const modal = document.getElementById('teamLogoModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Generates available username suggestions based on a base name
 * @param {string} baseName - Base name to generate suggestions from
 * @returns {Array} Array of available username suggestions
 */
function generateUsernameSuggestions(baseName) {
  const raw = slugify(baseName || 'peer').replace(/[^a-z0-9_]/g, '');
  const clean = raw.slice(0, 12) || 'peer';
  const accounts = readAccounts();
  const takenSlugs = new Set(accounts.map((a) => slugify(a.username)));

  const candidates = [
    `${clean}_dev`,
    `${clean}_pro`,
    `peer_${clean}`,
    `${clean}${Math.floor(10 + Math.random() * 89)}`,
    `${clean}_elite`,
    `the_${clean}`
  ];

  const available = [];
  for (const cand of candidates) {
    if (!takenSlugs.has(slugify(cand)) && !available.includes(cand)) {
      available.push(cand);
    }
    if (available.length >= 3) break;
  }

  return available;
}

/**
 * Renders username suggestions in the UI
 * @param {string} baseName - Base name to generate suggestions from
 */
function renderUsernameSuggestions(baseName) {
  const container = document.getElementById('usernameSuggestions');
  const list = document.getElementById('usernameSuggestionsList');
  if (!container || !list) return;

  const suggestions = generateUsernameSuggestions(baseName);
  if (!suggestions.length) {
    container.classList.add('hidden');
    return;
  }

  list.innerHTML = suggestions.map((sug) => `
    <button type="button" class="suggestion-chip" data-suggest="${escapeHtml(sug)}">💡 ${escapeHtml(sug)}</button>
  `).join('');

  list.querySelectorAll('.suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const input = document.getElementById('signupUsername');
      if (input) {
        input.value = chip.dataset.suggest;
        input.dispatchEvent(new Event('input'));
      }
      container.classList.add('hidden');
    });
  });

  container.classList.remove('hidden');
}

/**
 * Generates available team name suggestions based on a base name
 * @param {string} baseTeamName - Base team name to generate suggestions from
 * @returns {Array} Array of available team name suggestions
 */
function generateTeamNameSuggestions(baseTeamName) {
  const raw = normalizeText(baseTeamName || 'Innovators');
  const clean = raw.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 16) || 'Innovators';
  const teams = readTeams();
  const takenSlugs = new Set(teams.map((t) => slugify(t.name)));

  const candidates = [
    `${clean} Squad`,
    `${clean} Titans`,
    `Alpha ${clean}`,
    `${clean} Nexus`,
    `Team ${clean}`,
    `Apex ${clean}`
  ];

  const available = [];
  for (const cand of candidates) {
    if (!takenSlugs.has(slugify(cand)) && !available.includes(cand)) {
      available.push(cand);
    }
    if (available.length >= 3) break;
  }

  return available;
}

/**
 * Renders team name suggestions in the UI
 * @param {string} baseTeamName - Base team name to generate suggestions from
 */
function renderTeamNameSuggestions(baseTeamName) {
  const container = document.getElementById('teamNameSuggestions');
  const list = document.getElementById('teamNameSuggestionsList');
  if (!container || !list) return;

  const suggestions = generateTeamNameSuggestions(baseTeamName);
  if (!suggestions.length) {
    container.classList.add('hidden');
    return;
  }

  list.innerHTML = suggestions.map((sug) => `
    <button type="button" class="suggestion-chip" data-suggest="${escapeHtml(sug)}">🚀 ${escapeHtml(sug)}</button>
  `).join('');

  list.querySelectorAll('.suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const input = document.getElementById('signupTeamName');
      if (input) {
        input.value = chip.dataset.suggest;
        input.dispatchEvent(new Event('input'));
      }
      container.classList.add('hidden');
    });
  });

  container.classList.remove('hidden');
}

/**
 * Sets the current task filter and updates the UI
 * @param {string} filter - Filter type ('all', 'available', 'claimed', 'mine')
 */
function setTaskFilter(filter) {
  const allowed = ['all', 'available', 'claimed', 'mine'];
  currentTaskFilter = allowed.includes(filter) ? filter : 'all';
  document.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.taskFilter === currentTaskFilter);
  });
  renderTaskList();
}

/**
 * Sets the current chart type and updates the visualization
 * @param {string} type - Chart type ('pie', 'doughnut', 'bar', 'line')
 */
function setChartType(type) {
  const allowed = ['pie', 'doughnut', 'bar', 'line'];
  activeChartType = allowed.includes(type) ? type : 'pie';
  document.querySelectorAll('.chart-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.chartType === activeChartType);
  });
  renderChart();
}

/**
 * Ensures seed data exists for first-time users
 * Creates demo team with leader and member accounts
 */
function ensureSeedData() {
  const accounts = getJson(ACCOUNTS_KEY, []);
  if (accounts.length) {
    return;
  }

  const teamId = makeId('team');
  const leaderId = makeId('user');
  const memberId = makeId('user');
  const now = Date.now();
  const leader = {
    id: leaderId,
    username: 'leader',
    password: 'leader123',
    role: 'team-leader',
    fullName: 'Team Leader',
    teamId,
    profileImage: generateAvatarDataUrl('leader', 'Team Leader')
  };
  const member = {
    id: memberId,
    username: 'member',
    password: 'member123',
    role: 'team-member',
    fullName: 'Team Member',
    teamId,
    profileImage: generateAvatarDataUrl('member', 'Team Member')
  };

  const team = {
    id: teamId,
    name: 'Demo Team',
    leaderId,
    members: [leaderId, memberId],
    createdAt: now
  };

  const deadlineA = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString();
  const deadlineB = new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString();
  const board = {
    members: ['leader', 'member'],
    tasks: [
      { id: makeId('task'), title: 'Research sources', points: 10, assignedTo: 'leader', claimedBy: 'leader', claimedAt: new Date(now - 18 * 60 * 60 * 1000).toISOString(), deadline: deadlineA },
      { id: makeId('task'), title: 'Draft intro page', points: 15, assignedTo: 'member', claimedBy: 'member', claimedAt: new Date(now - 12 * 60 * 60 * 1000).toISOString(), deadline: deadlineB },
      { id: makeId('task'), title: 'Compile slides', points: 8, assignedTo: 'member', claimedBy: null, claimedAt: null, deadline: null }
    ],
    activeMember: 'leader'
  };

  setJson(ACCOUNTS_KEY, [leader, member]);
  setJson(TEAMS_KEY, [team]);
  const boardMap = {};
  boardMap[teamId] = board;
  setJson(BOARDS_KEY, boardMap);
  setJson(REQUESTS_KEY, []);
}

/**
 * Reads all user accounts from localStorage
 * @returns {Array} Array of account objects
 */
function readAccounts() {
  return getJson(ACCOUNTS_KEY, []);
}

/**
 * Saves accounts array to localStorage
 * @param {Array} accounts - Array of account objects to save
 */
function saveAccounts(accounts) {
  setJson(ACCOUNTS_KEY, accounts);
}

/**
 * Reads all teams from localStorage
 * @returns {Array} Array of team objects
 */
function readTeams() {
  return getJson(TEAMS_KEY, []);
}

/**
 * Saves teams array to localStorage
 * @param {Array} teams - Array of team objects to save
 */
function saveTeams(teams) {
  setJson(TEAMS_KEY, teams);
}

/**
 * Synchronizes team memberships across accounts
 * Ensures all team members have consistent teamId references
 */
function syncTeamMemberships() {
  const accounts = readAccounts();
  const teams = readTeams();

  teams.forEach((team) => {
    const validMemberIds = new Set();
    const teamAccounts = accounts.filter((account) => account.teamId === team.id);

    teamAccounts.forEach((account) => validMemberIds.add(account.id));
    (team.members || []).forEach((memberId) => {
      if (accounts.some((account) => account.id === memberId)) {
        validMemberIds.add(memberId);
      }
    });

    team.members = Array.from(validMemberIds);
  });

  saveTeams(teams);
}

/**
 * Reads all task boards from localStorage
 * @returns {Object} Object mapping team IDs to task boards
 */
function readBoards() {
  return getJson(BOARDS_KEY, {});
}

/**
 * Saves all task boards to localStorage
 * @param {Object} boards - Object mapping team IDs to task boards
 */
function saveBoards(boards) {
  setJson(BOARDS_KEY, boards);
}

/**
 * Gets all team IDs for a user account
 * @param {Object} account - User account object
 * @returns {Array} Array of team IDs the user belongs to
 */
function getUserTeamIds(account) {
  if (!account) {
    return [];
  }

  const teamIds = Array.isArray(account.teamIds) ? account.teamIds : [];
  if (account.teamId && !teamIds.includes(account.teamId)) {
    teamIds.push(account.teamId);
  }

  return Array.from(new Set(teamIds.filter(Boolean)));
}

/**
 * Normalizes user's team state to ensure consistency
 * @param {Object} account - User account object
 * @returns {Object|null} Normalized account object
 */
function normalizeUserTeamState(account) {
  if (!account) {
    return null;
  }

  const teamIds = getUserTeamIds(account);
  const activeTeamId = teamIds.includes(account.activeTeamId) ? account.activeTeamId : teamIds[0] || null;
  const normalized = { ...account, teamIds, activeTeamId, teamId: activeTeamId };
  return normalized;
}

/**
 * Gets the currently logged-in user
 * @returns {Object|null} Current user account object or null
 */
function getCurrentUser() {
  const current = getJson(CURRENT_USER_KEY, null);
  if (!current || !current.id) {
    return null;
  }

  const account = readAccounts().find((item) => item.id === current.id) || null;
  if (!account) {
    return null;
  }

  const normalized = normalizeUserTeamState(account);
  const accounts = readAccounts().map((item) => item.id === normalized.id ? normalized : item);
  saveAccounts(accounts);
  return normalized;
}

/**
 * Sets the currently logged-in user
 * @param {Object} account - User account object to set as current
 */
function setCurrentUser(account) {
  if (!account) {
    localStorage.removeItem(CURRENT_USER_KEY);
    return;
  }

  const normalized = normalizeUserTeamState(account);
  setJson(CURRENT_USER_KEY, { id: normalized.id, activeTeamId: normalized.activeTeamId || null });
  const accounts = readAccounts().map((item) => item.id === normalized.id ? normalized : item);
  saveAccounts(accounts);
}

/**
 * Gets the current team for the logged-in user
 * @returns {Object|null} Current team object or null
 */
function getCurrentTeam() {
  const user = getCurrentUser();
  if (!user) {
    return null;
  }

  const activeTeamId = user.activeTeamId || user.teamId || getUserTeamIds(user)[0] || null;
  if (!activeTeamId) {
    return null;
  }

  return readTeams().find((team) => team.id === activeTeamId) || null;
}

/**
 * Checks if a user is a member or leader of a team
 * @param {Object} user - User account object
 * @param {Object} team - Team object
 * @returns {boolean} True if user is member or leader
 */
function isTeamMemberOrLeader(user, team) {
  if (!user || !team) {
    return false;
  }
  const isLeader = team.leaderId === user.id || (user.role === 'team-leader' && Array.isArray(team.members) && team.members.includes(user.id));
  const isMember = Array.isArray(team.members) && team.members.includes(user.id);
  return Boolean(isLeader || isMember);
}

/**
 * Gets all members of a team
 * @param {string} teamId - Team ID
 * @returns {Array} Array of member account objects
 */
function getTeamMembers(teamId) {
  const team = readTeams().find((item) => item.id === teamId);
  if (!team) {
    return [];
  }

  const accounts = readAccounts();
  return team.members.map((memberId) => accounts.find((account) => account.id === memberId)).filter(Boolean);
}

/**
 * Gets usernames of all team members
 * @param {string} teamId - Team ID
 * @returns {Array} Array of member usernames
 */
function getTeamMemberNames(teamId) {
  return getTeamMembers(teamId).map((member) => member.username);
}

/**
 * Gets display name for a team member
 * @param {string} teamId - Team ID
 * @param {string} username - Member username
 * @returns {string} Display name (full name or username)
 */
function getMemberDisplayName(teamId, username) {
  if (!username) {
    return 'Unassigned';
  }

  const member = getTeamMembers(teamId).find((item) => item.username === username);
  return member?.fullName || member?.username || username;
}

/**
 * Gets or creates the task board for a team
 * @param {string} teamId - Team ID
 * @returns {Object} Team board object with tasks and members
 */
function getTeamBoard(teamId) {
  const boards = readBoards();
  if (!boards[teamId]) {
    const board = {
      members: getTeamMemberNames(teamId),
      tasks: [],
      activeMember: getTeamMemberNames(teamId)[0] || ''
    };
    boards[teamId] = board;
    saveBoards(boards);
  }
  return boards[teamId];
}

/**
 * Saves the task board for a team
 * @param {string} teamId - Team ID
 * @param {Object} board - Board object to save
 */
function saveTeamBoard(teamId, board) {
  const boards = readBoards();
  boards[teamId] = board;
  saveBoards(boards);
}

/**
 * Refreshes board membership from current team members
 * @param {string} teamId - Team ID
 */
function refreshBoardFromTeam(teamId) {
  syncTeamMemberships();
  const board = getTeamBoard(teamId);
  const members = getTeamMemberNames(teamId);
  board.members = members;
  if (!board.activeMember || !members.includes(board.activeMember)) {
    board.activeMember = members[0] || '';
  }
  saveTeamBoard(teamId, board);
}

/**
 * Gets human-readable label for user role
 * @param {string} role - User role ('team-leader' or 'team-member')
 * @returns {string} Human-readable role label
 */
function getRoleLabel(role) {
  return role === 'team-leader' ? 'Team Leader' : 'Team Member';
}

/**
 * Shows the authentication screen and hides the app
 */
function showAuthScreen() {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
}

/**
 * Shows the app screen and hides authentication
 */
function showAppScreen() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
}

/**
 * Toggles between login and signup tabs
 * @param {string} tabName - Tab to show ('login' or 'signup')
 */
function toggleAuthTab(tabName) {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const tabs = document.querySelectorAll('.auth-tab');

  tabs.forEach((tab) => {
    const isActive = tab.dataset.authTab === tabName;
    tab.classList.toggle('active', isActive);
  });

  loginForm.classList.toggle('hidden', tabName !== 'login');
  signupForm.classList.toggle('hidden', tabName !== 'signup');
  syncSignupRoleFields();
}

/**
 * Syncs signup form fields based on selected role
 * Shows/hides team name field for team leaders
 */
function syncSignupRoleFields() {
  const roleSelect = document.getElementById('signupRole');
  const teamNameField = document.getElementById('signupTeamName');
  const teamNameLabel = document.querySelector('label[for="signupTeamName"]');
  if (!roleSelect || !teamNameField) {
    return;
  }

  const isLeader = roleSelect.value === 'team-leader';
  if (teamNameLabel) {
    teamNameLabel.classList.toggle('hidden', !isLeader);
  }
  teamNameField.classList.toggle('hidden', !isLeader);
  if (!isLeader) {
    teamNameField.value = '';
  }
}

/**
 * Handles user login form submission
 * @param {Event} event - Form submit event
 */
function handleLogin(event) {
  event.preventDefault();
  const role = document.getElementById('loginRole').value;
  const username = normalizeText(document.getElementById('loginUsername').value);
  const password = normalizeText(document.getElementById('loginPassword').value);

  const matchedUser = readAccounts().find((account) => {
    return account.role === role && slugify(account.username) === slugify(username) && account.password === password;
  });

  if (!matchedUser) {
    alert('Invalid login details. Please check your role, username and password.');
    return;
  }

  setCurrentUser(matchedUser);
  renderApp();
}

/**
 * Handles user signup form submission
 * @param {Event} event - Form submit event
 */
async function handleSignup(event) {
  event.preventDefault();

  const role = document.getElementById('signupRole').value;
  const fullName = normalizeText(document.getElementById('signupFullName').value);
  const username = normalizeText(document.getElementById('signupUsername').value);
  const password = normalizeText(document.getElementById('signupPassword').value);
  const teamName = normalizeText(document.getElementById('signupTeamName').value);

  if (!fullName || !username || !password) {
    alert('Please complete all required signup fields.');
    return;
  }

  if (username.length < 3) {
    alert('Username must be at least 3 characters.');
    return;
  }

  if (password.length < 6) {
    alert('Password must be at least 6 characters.');
    return;
  }

  if (isUsernameTaken(username)) {
    alert('That username is already taken. Please choose another one.');
    return;
  }

  if (role === 'team-leader') {
    if (!teamName) {
      alert('Team leaders must create a team name when signing up.');
      return;
    }
    if (teamName.length < 2) {
      alert('Team name is too short. Please use at least 2 characters.');
      return;
    }
    if (isTeamNameTaken(teamName)) {
      alert('That team name is already taken. Please choose a different team name.');
      return;
    }
  }

  const profileImage = generateAvatarDataUrl(username, fullName);
  const accounts = readAccounts();

  if (role === 'team-leader') {
    const teamId = makeId('team');
    const newUser = {
      id: makeId('user'),
      username,
      password,
      role,
      fullName,
      teamIds: [teamId],
      activeTeamId: teamId,
      teamId,
      profileImage
    };

    const teams = readTeams();
    teams.push({
      id: teamId,
      name: teamName,
      leaderId: newUser.id,
      members: [newUser.id],
      createdAt: Date.now(),
      logoImage: null
    });

    accounts.push(newUser);
    saveAccounts(accounts);
    saveTeams(teams);
    saveTeamBoard(teamId, { members: [newUser.username], tasks: [], activeMember: newUser.username });
    setCurrentUser(newUser);
    renderApp();
    return;
  }

  const newUser = {
    id: makeId('user'),
    username,
    password,
    role,
    fullName,
    teamIds: [],
    activeTeamId: null,
    teamId: null,
    profileImage
  };

  accounts.push(newUser);
  saveAccounts(accounts);
  setCurrentUser(newUser);
  renderApp();
}

function handleLogout() {
  setCurrentUser(null);
  renderApp();
}

/**
 * Creates a new team for the current team leader
 */
function createNewTeam() {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'team-leader') {
    return;
  }

  const teamNameInput = document.getElementById('teamNameInput');
  const teamName = normalizeText(teamNameInput.value);
  if (!teamName) {
    teamNameInput.focus();
    return;
  }

  if (teamName.length < 2) {
    alert('Team name must be at least 2 characters.');
    return;
  }

  if (isTeamNameTaken(teamName)) {
    alert('A team with that name already exists. Please choose a different name.');
    return;
  }

  const nextTeamId = makeId('team');
  const nextTeam = {
    id: nextTeamId,
    name: teamName,
    leaderId: currentUser.id,
    members: [currentUser.id],
    createdAt: Date.now(),
    logoImage: null
  };

  const nextUser = normalizeUserTeamState({
    ...currentUser,
    teamIds: Array.from(new Set([...(currentUser.teamIds || getUserTeamIds(currentUser)), nextTeamId])),
    activeTeamId: nextTeamId,
    teamId: nextTeamId
  });

  const accounts = readAccounts().map((account) => account.id === currentUser.id ? nextUser : account);
  saveAccounts(accounts);
  const teams = readTeams();
  teams.push(nextTeam);
  saveTeams(teams);
  saveTeamBoard(nextTeamId, { members: [currentUser.username], tasks: [], activeMember: currentUser.username });
  teamNameInput.value = '';
  setInputStatus('teamNameInput', 'idle', '');
  setCurrentUser(nextUser);
  renderApp();
}

/**
 * Adds a member to the current team (sent by team leader)
 * Creates an invite request for the member
 */
function addMemberFromLeader() {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'team-leader') {
    return;
  }

  const usernameInput = document.getElementById('memberName');
  const fullNameInput = document.getElementById('memberFullName');

  const username = normalizeText(usernameInput.value);
  const fullName = normalizeText(fullNameInput.value);

  if (!username) {
    usernameInput.focus();
    return;
  }

  const accounts = readAccounts();
  const invitedUser = accounts.find((account) => slugify(account.username) === slugify(username));
  if (!invitedUser) {
    alert('That member does not have an account yet. Ask them to sign up first, then send the invite.');
    return;
  }

  if (invitedUser.role !== 'team-member') {
    alert('Only team members can be invited into a team.');
    return;
  }

  const requests = readRequests();
  const duplicateRequest = requests.find((request) => request.teamId === currentUser.teamId && request.userId === invitedUser.id && request.status === 'pending');
  if (duplicateRequest) {
    alert('A pending request for this member already exists.');
    return;
  }

  if (fullName && invitedUser.fullName !== fullName) {
    invitedUser.fullName = fullName;
  }

  requests.push({
    id: makeId('request'),
    type: 'invite',
    teamId: currentUser.teamId,
    userId: invitedUser.id,
    createdByUserId: currentUser.id,
    createdAt: Date.now(),
    status: 'pending'
  });

  saveAccounts(accounts);
  saveRequests(requests);
  usernameInput.value = '';
  fullNameInput.value = '';
  alert(`Invite sent to ${invitedUser.fullName || invitedUser.username}. The member must accept it before joining the team.`);
  renderApp();
}

/**
 * Removes a member from the current team
 * @param {string} memberId - ID of member to remove
 */
function removeTeamMember(memberId) {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'team-leader') {
    return;
  }

  if (memberId === currentUser.id) {
    alert('You cannot remove yourself from the team while you are the leader.');
    return;
  }

  const teams = readTeams();
  const currentTeam = teams.find((team) => team.id === (currentUser.activeTeamId || currentUser.teamId));
  if (!currentTeam) {
    return;
  }

  const memberToRemove = readAccounts().find((account) => account.id === memberId);
  currentTeam.members = currentTeam.members.filter((id) => id !== memberId);

  const board = getTeamBoard(currentTeam.id);
  board.tasks = (board.tasks || []).map((task) => {
    if (task.assignedTo === memberToRemove?.username) {
      return { ...task, assignedTo: null, claimedBy: task.claimedBy === memberToRemove.username ? null : task.claimedBy };
    }
    return task;
  });

  const accounts = readAccounts();
  const accountToRemove = accounts.find((account) => account.id === memberId);
  if (accountToRemove) {
    const remainingTeamIds = (accountToRemove.teamIds || getUserTeamIds(accountToRemove)).filter((teamId) => teamId !== currentTeam.id);
    accountToRemove.teamIds = remainingTeamIds;
    accountToRemove.teamId = remainingTeamIds[0] || null;
    accountToRemove.activeTeamId = remainingTeamIds.includes(accountToRemove.activeTeamId) ? accountToRemove.activeTeamId : remainingTeamIds[0] || null;
  }
  saveAccounts(accounts);

  refreshBoardFromTeam(currentTeam.id);
  saveTeams(teams);
  renderApp();
}

function getRequestsByTeam(teamId) {
  return readRequests().filter((request) => request.teamId === teamId && request.status === 'pending');
}

function acceptRequest(requestId) {
  const currentUser = getCurrentUser();
  const requests = readRequests();
  const request = requests.find((item) => item.id === requestId);
  if (!request) {
    return;
  }

  const teams = readTeams();
  const accounts = readAccounts();
  const team = teams.find((item) => item.id === request.teamId);
  const memberAccount = accounts.find((account) => account.id === request.userId);

  if (!team || !memberAccount) {
    return;
  }

  if (request.type === 'invite') {
    if (!(currentUser && currentUser.id === request.userId && currentUser.role === 'team-member')) {
      return;
    }

    if (!team.members.includes(memberAccount.id)) {
      team.members.push(memberAccount.id);
    }
    memberAccount.teamIds = Array.from(new Set([...(memberAccount.teamIds || getUserTeamIds(memberAccount)), team.id]));
    memberAccount.activeTeamId = team.id;
    memberAccount.teamId = team.id;
  } else if (request.type === 'join-request') {
    if (!(currentUser && currentUser.role === 'team-leader' && currentUser.id === team.leaderId && getUserTeamIds(currentUser).includes(team.id))) {
      return;
    }

    if (!team.members.includes(memberAccount.id)) {
      team.members.push(memberAccount.id);
    }
    memberAccount.teamIds = Array.from(new Set([...(memberAccount.teamIds || getUserTeamIds(memberAccount)), team.id]));
    memberAccount.activeTeamId = team.id;
    memberAccount.teamId = team.id;
  } else {
    return;
  }

  saveTeams(teams);
  saveAccounts(accounts);
  request.status = 'accepted';
  saveRequests(requests);
  setCurrentUser(currentUser || memberAccount);
  renderApp();
}

function rejectRequest(requestId) {
  const requests = readRequests();
  const request = requests.find((item) => item.id === requestId);
  if (!request) {
    return;
  }
  request.status = 'rejected';
  saveRequests(requests);
  renderApp();
}

function requestToJoinTeam(teamId) {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'team-member') {
    return;
  }

  if (getUserTeamIds(currentUser).includes(teamId)) {
    alert('You are already a member of this team.');
    return;
  }

  const team = readTeams().find((item) => item.id === teamId);
  if (!team) {
    return;
  }

  const requests = readRequests();
  if (requests.some((request) => request.teamId === teamId && request.userId === currentUser.id && request.status === 'pending')) {
    alert('You already sent a request to join this team.');
    return;
  }

  requests.push({
    id: makeId('request'),
    type: 'join-request',
    teamId,
    userId: currentUser.id,
    createdByUserId: currentUser.id,
    createdAt: Date.now(),
    status: 'pending'
  });
  saveRequests(requests);
  renderApp();
}

function searchTeams() {
  const currentUser = getCurrentUser();
  const input = document.getElementById('teamSearchInput');
  const query = normalizeText(input ? input.value : '');
  const results = document.getElementById('teamSearchResults');
  if (!results || !currentUser || currentUser.role !== 'team-member') {
    results.innerHTML = '<div class="empty-state">Team search is available to members.</div>';
    return;
  }

  const userTeamIds = new Set(getUserTeamIds(currentUser));
  const teams = readTeams().filter((team) => {
    if (userTeamIds.has(team.id)) {
      return false;
    }
    if (!query) {
      return true;
    }
    return team.name.toLowerCase().includes(query.toLowerCase());
  });

  if (!teams.length) {
    results.innerHTML = '<div class="empty-state">No teams match your search yet.</div>';
    return;
  }

  results.innerHTML = teams.map((team) => `
    <div class="request-card team-search-card">
      <div>
        <strong>${escapeHtml(team.name)}</strong>
        <p class="request-meta">${team.members.length} members</p>
      </div>
      <button type="button" class="primary-button small-button" data-team-id="${team.id}">Request join</button>
    </div>
  `).join('');

  results.querySelectorAll('[data-team-id]').forEach((button) => {
    button.addEventListener('click', () => requestToJoinTeam(button.dataset.teamId));
  });
}

/**
 * Renders the join request lists for both leaders and members
 * Shows pending invites and join requests
 */
function renderJoinRequestLists() {
  const currentUser = getCurrentUser();
  const team = getCurrentTeam();

  const leaderRequestList = document.getElementById('leaderRequestList');
  const memberRequestList = document.getElementById('memberRequestList');
  if (!leaderRequestList || !memberRequestList || !currentUser) {
    return;
  }

  if (currentUser.role === 'team-leader' && team) {
    const requests = getRequestsByTeam(team.id);
    leaderRequestList.innerHTML = requests.length ? requests.map((request) => {
      const user = readAccounts().find((account) => account.id === request.userId);
      const teamName = readTeams().find((item) => item.id === request.teamId)?.name || 'team';
      return `
        <div class="request-card">
          <div>
            <strong>${escapeHtml(user?.fullName || user?.username || 'Member')}</strong>
            <p class="request-meta">${request.type === 'invite' ? 'Invite' : 'Join request'} · ${escapeHtml(teamName)}</p>
          </div>
          <div class="request-actions">
            <button type="button" class="secondary-button small-button" data-accept-request="${request.id}">Accept</button>
            <button type="button" class="remove-button small-button" data-reject-request="${request.id}">Reject</button>
          </div>
        </div>
      `;
    }).join('') : '<div class="empty-state">No pending requests.</div>';

    leaderRequestList.querySelectorAll('[data-accept-request]').forEach((button) => {
      button.addEventListener('click', () => acceptRequest(button.dataset.acceptRequest));
    });
    leaderRequestList.querySelectorAll('[data-reject-request]').forEach((button) => {
      button.addEventListener('click', () => rejectRequest(button.dataset.rejectRequest));
    });
  } else {
    leaderRequestList.innerHTML = '<div class="empty-state">Leader requests will show here.</div>';
  }

  const userRequests = readRequests().filter((request) => request.userId === currentUser.id && request.status === 'pending');
  memberRequestList.innerHTML = userRequests.length ? userRequests.map((request) => {
    const team = readTeams().find((item) => item.id === request.teamId);
    const isInvite = request.type === 'invite';
    return `
      <div class="request-card">
        <div>
          <strong>${escapeHtml(team?.name || 'Team')}</strong>
          <p class="request-meta">${isInvite ? 'Team invite' : 'Join request pending'}</p>
        </div>
        <div class="request-actions">
          ${isInvite ? `<button type="button" class="primary-button small-button" data-accept-request="${request.id}">Accept</button>` : ''}
          <button type="button" class="secondary-button small-button" data-reject-request="${request.id}">Dismiss</button>
        </div>
      </div>
    `;
  }).join('') : '<div class="empty-state">No requests yet.</div>';

  memberRequestList.querySelectorAll('[data-accept-request]').forEach((button) => {
    button.addEventListener('click', () => {
      const requestId = button.dataset.acceptRequest;
      const request = readRequests().find((item) => item.id === requestId);
      // Only allow accepting invites for team members
      if (request && request.type === 'invite' && currentUser.role === 'team-member') {
        acceptRequest(requestId);
      }
    });
  });
  memberRequestList.querySelectorAll('[data-reject-request]').forEach((button) => {
    button.addEventListener('click', () => rejectRequest(button.dataset.rejectRequest));
  });

  const teamSearchResults = document.getElementById('teamSearchResults');
  if (teamSearchResults) {
    searchTeams();
  }
}

/**
 * Renders team search results for members to join
 */
function renderMemberSearchResults() {
  const currentUser = getCurrentUser();
  const memberRequestList = document.getElementById('memberRequestList');
  if (!memberRequestList || !currentUser || currentUser.role !== 'team-member') {
    return;
  }
  searchTeams();
}

/**
 * Renders the current user's profile summary
 */
function renderProfileSummary() {
  const currentUser = getCurrentUser();
  const profileSummary = document.getElementById('profileSummary');
  if (!profileSummary || !currentUser) {
    return;
  }

  const photo = getProfilePhoto(currentUser);
  const teamName = getCurrentTeam()?.name || 'No team assigned yet';
  profileSummary.innerHTML = `
    <div class="profile-summary-card">
      <img class="profile-avatar" src="${photo}" alt="${escapeHtml(currentUser.fullName || currentUser.username)}" />
      <div>
        <strong>${escapeHtml(currentUser.fullName || currentUser.username)}</strong>
        <span>${escapeHtml(getRoleLabel(currentUser.role))}</span>
        <small>${escapeHtml(teamName)}</small>
      </div>
    </div>
  `;
}

function updateTopbarProfileImage() {
  const currentUser = getCurrentUser();
  const img = document.getElementById('topbarProfileImage');
  if (!img) {
    return;
  }

  img.src = currentUser ? getProfilePhoto(currentUser) : '';
  img.alt = currentUser ? currentUser.fullName || currentUser.username : 'Profile photo';
}

function toggleProfileMenu(forceOpen) {
  const menu = document.getElementById('profileMenu');
  const button = document.getElementById('profileMenuButton');
  if (!menu || !button) {
    return;
  }

  const nextState = typeof forceOpen === 'boolean' ? forceOpen : menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !nextState);
  button.setAttribute('aria-expanded', String(nextState));
}

async function handleProfileImageSelection(mode = 'upload') {
  const fileInput = document.getElementById('profileUploadInput');
  if (!fileInput) {
    return;
  }

  fileInput.setAttribute('capture', mode === 'camera' ? 'environment' : '');
  fileInput.value = '';
  fileInput.click();
}

async function saveProfileImageFromFile(file) {
  const currentUser = getCurrentUser();
  if (!file || !currentUser) {
    return;
  }

  const imageData = await readFileAsDataUrl(file);
  const accounts = readAccounts().map((account) => account.id === currentUser.id ? { ...account, profileImage: imageData } : account);
  saveAccounts(accounts);
  setCurrentUser({ ...currentUser, profileImage: imageData });
  updateTopbarProfileImage();
  renderProfileSummary();
  renderTeamMembers();
  renderApp();
}

/**
 * Removes the current user's profile image
 */
function removeProfileImage() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    return;
  }

  const defaultImage = generateAvatarDataUrl(currentUser.username, currentUser.fullName || currentUser.username);
  const accounts = readAccounts().map((account) => account.id === currentUser.id ? { ...account, profileImage: defaultImage } : account);
  saveAccounts(accounts);
  setCurrentUser({ ...currentUser, profileImage: defaultImage });
  updateTopbarProfileImage();
  renderProfileSummary();
  renderTeamMembers();
  renderApp();
}

/**
 * Renders the list of team members in the UI
 */
function renderTeamMembers() {
  const memberList = document.getElementById('memberList');
  const currentUser = getCurrentUser();
  const team = getCurrentTeam();
  if (!memberList || !currentUser) {
    return;
  }

  if (!team) {
    memberList.innerHTML = '<div class="empty-state">No team assigned yet. Search for a team and send a join request.</div>';
    return;
  }

  const allAccounts = readAccounts();
  const leaderAccount = allAccounts.find((acc) => acc.id === team.leaderId);
  const allTeamMembers = getTeamMembers(team.id);
  const otherMembers = allTeamMembers.filter((member) => member.id !== team.leaderId);
  const isCurrentUserLeader = currentUser.role === 'team-leader' && team.leaderId === currentUser.id;

  let html = '';

  // 1. Render Team Leader (ONLY ONCE as Team Leader)
  if (leaderAccount) {
    const leaderPhoto = getProfilePhoto(leaderAccount);
    html += `
      <div class="team-leader-card">
        <div class="member-info-wrap">
          <img class="member-avatar" src="${leaderPhoto}" alt="${escapeHtml(leaderAccount.fullName || leaderAccount.username)}" />
          <div>
            <strong>${escapeHtml(leaderAccount.fullName || leaderAccount.username)}</strong>
            <span class="member-role">👑 Team Leader</span>
          </div>
        </div>
      </div>
    `;
  }

  // 2. Render Team Members
  html += `<div class="members-subhead">Team Members (${otherMembers.length})</div>`;

  if (otherMembers.length === 0) {
    html += '<p class="helper-text" style="font-size:0.8rem; padding: 4px 0 8px;">No other members joined yet.</p>';
  } else {
    html += otherMembers.map((member) => {
      const canRemove = isCurrentUserLeader;
      const photo = getProfilePhoto(member);
      return `
        <div class="member-item">
          <div class="member-info-wrap">
            <img class="member-avatar" src="${photo}" alt="${escapeHtml(member.fullName || member.username)}" />
            <div>
              <strong>${escapeHtml(member.fullName || member.username)}</strong>
              <span class="member-role">${getRoleLabel(member.role)}</span>
            </div>
          </div>
          ${canRemove ? `<button type="button" class="remove-member-button" data-member-id="${member.id}">Remove</button>` : ''}
        </div>
      `;
    }).join('');
  }

  memberList.innerHTML = html;

  memberList.querySelectorAll('.remove-member-button').forEach((button) => {
    button.addEventListener('click', () => {
      removeTeamMember(button.dataset.memberId);
    });
  });
}

/**
 * Renders the assignee dropdown options for task creation
 */
function renderTaskAssigneeOptions() {
  const currentUser = getCurrentUser();
  const team = getCurrentTeam();
  const taskAssignee = document.getElementById('taskAssignee');
  if (!taskAssignee || !team || !currentUser) {
    return;
  }

  const members = getTeamMembers(team.id).filter((member) => member.username !== currentUser.username);
  const options = ['<option value="unassigned">Unassigned</option>'];
  members.forEach((member) => {
    options.push(`<option value="${member.username}">${member.username}</option>`);
  });
  taskAssignee.innerHTML = options.join('');
}

/**
 * Renders the task list for the current team
 * Displays all tasks with their status and actions
 */
function renderTaskList() {
  const currentUser = getCurrentUser();
  const team = getCurrentTeam();
  const tasksList = document.getElementById('taskList');
  const taskCountBadge = document.getElementById('taskCountBadge');

  if (!tasksList || !currentUser || !team) {
    if (tasksList) {
      tasksList.innerHTML = '<div class="empty-state">Please log in to continue.</div>';
    }
    if (taskCountBadge) {
      taskCountBadge.textContent = '0 tasks';
    }
    return;
  }

  const board = getTeamBoard(team.id);
  const isLeader = currentUser.role === 'team-leader';
  const allTasks = board.tasks || [];

  let visibleTasks = allTasks;
  if (currentTaskFilter === 'available') {
    visibleTasks = allTasks.filter((task) => !task.claimedBy);
  } else if (currentTaskFilter === 'claimed') {
    visibleTasks = allTasks.filter((task) => Boolean(task.claimedBy));
  } else if (currentTaskFilter === 'mine') {
    visibleTasks = allTasks.filter((task) => task.assignedTo === currentUser.username || task.claimedBy === currentUser.username);
  }

  if (taskCountBadge) {
    taskCountBadge.textContent = `${visibleTasks.length} ${visibleTasks.length === 1 ? 'task' : 'tasks'}`;
  }

  if (!visibleTasks.length) {
    tasksList.innerHTML = `
      <div class="empty-state">
        <p>No tasks found in <strong>${currentTaskFilter}</strong> category.</p>
        ${isLeader ? '<p class="helper-text">Add a new task using the form above.</p>' : ''}
      </div>
    `;
    return;
  }

  tasksList.innerHTML = visibleTasks.map((task) => {
    const taskIndex = board.tasks.indexOf(task);
    const isClaimed = Boolean(task.claimedBy);
    const isAssignedToCurrentUser = task.assignedTo === currentUser.username;
    const canClaim = !isLeader && isAssignedToCurrentUser && !isClaimed;
    const claimedByName = task.claimedBy ? getMemberDisplayName(team.id, task.claimedBy) : '';
    const assignedToName = task.assignedTo ? getMemberDisplayName(team.id, task.assignedTo) : 'Unassigned';
    const lateClaim = isTaskLate(task);
    const effectivePoints = getTaskEffectivePoints(task);
    const claimLabel = isClaimed
      ? (lateClaim ? 'Claimed after deadline' : `Claimed by ${claimedByName}`)
      : (canClaim ? `Claim for ${currentUser.username}` : 'Locked');
    const claimDisabled = !canClaim || isClaimed ? 'disabled' : '';
    const statusText = isClaimed
      ? `Completed by ${claimedByName}${lateClaim ? ' · late claim' : ''}`
      : (task.assignedTo ? `Assigned to ${assignedToName}` : 'Unassigned');

    return `
      <article class="task-card ${lateClaim ? 'late-task' : ''} ${isClaimed ? 'claimed' : ''}" data-index="${taskIndex}">
        <div class="task-topline">
          <h3 class="task-title">${escapeHtml(task.title)}</h3>
          <span class="task-points">${effectivePoints} pts</span>
        </div>
        <div class="task-meta">
          <span class="status-dot" aria-hidden="true"></span>
          <span class="status-text">${statusText}</span>
        </div>
        <div class="task-meta task-meta-secondary">
          <span class="deadline-pill">${task.deadline ? `Deadline: ${formatDateTime(task.deadline)}` : 'No deadline'}</span>
          ${task.claimedAt ? `<span class="claim-time-pill">Claimed: ${formatDateTime(task.claimedAt)}</span>` : ''}
          ${lateClaim ? '<span class="late-tag">Claimed after deadline</span>' : ''}
        </div>
        <div class="task-actions">
          <button
            type="button"
            class="claim-button ${isClaimed ? 'claimed' : ''}"
            data-index="${taskIndex}"
            ${claimDisabled}
          >
            ${claimLabel}
          </button>
          ${isLeader ? `
            <button type="button" class="edit-button" data-index="${taskIndex}">Edit</button>
            <button type="button" class="remove-button" data-index="${taskIndex}">Remove</button>
          ` : ''}
        </div>
      </article>
    `;
  }).join('');

  tasksList.querySelectorAll('.claim-button').forEach((button) => {
    button.addEventListener('click', () => {
      const taskIndex = Number(button.dataset.index);
      claimTask(taskIndex);
    });
  });

  tasksList.querySelectorAll('.edit-button').forEach((button) => {
    button.addEventListener('click', () => {
      const taskIndex = Number(button.dataset.index);
      openEditModal(taskIndex);
    });
  });

  tasksList.querySelectorAll('.remove-button').forEach((button) => {
    button.addEventListener('click', () => {
      const taskIndex = Number(button.dataset.index);
      removeTask(taskIndex);
    });
  });
}

/**
 * Renders the contribution chart using Chart.js
 * Shows team member contribution distribution
 */
function renderChart() {
  const currentUser = getCurrentUser();
  const team = getCurrentTeam();
  if (!currentUser || !team) {
    return;
  }

  const board = getTeamBoard(team.id);
  const teamMembers = getTeamMembers(team.id);
  const visibleMembers = teamMembers.filter((member) => member.role !== 'team-leader');
  const totals = visibleMembers.reduce((result, member) => {
    result[member.username] = 0;
    return result;
  }, {});

  board.tasks.forEach((task) => {
    if (!task.claimedBy || totals[task.claimedBy] === undefined) {
      return;
    }

    const contributionPoints = getTaskEffectivePoints(task);
    totals[task.claimedBy] += contributionPoints;
  });

  const labels = visibleMembers.map((member) => member.fullName || member.username);
  const series = visibleMembers.map((member) => totals[member.username] || 0);
  const canvas = document.getElementById('contributionChart');

  if (chartInstance) {
    chartInstance.destroy();
  }

  if (canvas) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f1f5f9' : '#334155';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';

    const chartConfig = {
      type: activeChartType,
      data: {
        labels,
        datasets: [{
          label: 'Points Earned',
          data: series,
          backgroundColor: labels.map((_, idx) => DEFAULT_COLORS[idx % DEFAULT_COLORS.length]),
          borderColor: activeChartType === 'line' ? DEFAULT_COLORS[0] : '#ffffff',
          borderWidth: activeChartType === 'line' ? 3 : 2,
          fill: activeChartType === 'line',
          tension: 0.35,
          pointBackgroundColor: labels.map((_, idx) => DEFAULT_COLORS[idx % DEFAULT_COLORS.length]),
          pointRadius: 6,
          pointHoverRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                const { label, parsed, dataset } = context;
                const value = (activeChartType === 'bar' || activeChartType === 'line') ? parsed.y : parsed;
                const total = dataset.data.reduce((sum, val) => sum + Number(val || 0), 0);
                const share = total ? ((value / total) * 100).toFixed(1) : '0.0';
                return `${label}: ${value} pts (${share}%)`;
              }
            }
          }
        },
        scales: (activeChartType === 'bar' || activeChartType === 'line') ? {
          x: {
            ticks: { color: textColor, font: { family: 'Inter, sans-serif', size: 11 } },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: { color: textColor, font: { family: 'Inter, sans-serif', size: 11 }, precision: 0 },
            grid: { color: gridColor }
          }
        } : {}
      }
    };

    chartInstance = new Chart(canvas, chartConfig);
  }

  renderLegend(labels, series);
  const totalContributionPoints = series.reduce((sum, value) => sum + Number(value || 0), 0);
  document.getElementById('totalPoints').textContent = String(totalContributionPoints);
  renderPrintReceipt(team, teamMembers, totals);
}

/**
 * Renders the chart legend with member colors and totals
 * @param {Array} labels - Chart labels (member names)
 * @param {Array} series - Chart data series
 */
function renderLegend(labels, series) {
  const legend = document.getElementById('legend');
  const total = series.reduce((sum, value) => sum + Number(value), 0) || 1;

  legend.innerHTML = labels.map((member, idx) => {
    const value = Number(series[idx] || 0);
    const share = ((value / total) * 100).toFixed(1);
    const color = DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
    return `
      <div class="legend-item">
        <span class="legend-label">
          <span class="legend-swatch" style="background:${color};"></span>
          <span>${member}</span>
        </span>
        <strong>${value} pts (${share}%)</strong>
      </div>
    `;
  }).join('');
}

/**
 * Renders the printable receipt data
 * @param {Object} team - Team object
 * @param {Array} teamMembers - Array of team members
 * @param {Object} totals - Contribution totals by member
 */
function renderPrintReceipt(team, teamMembers, totals) {
  const receipt = document.getElementById('printReceiptMeta');
  if (!receipt) {
    return;
  }

  const leader = teamMembers.find((member) => member.role === 'team-leader');
  const contributors = teamMembers.filter((member) => member.role !== 'team-leader');
  const totalClaimedPoints = contributors.reduce((sum, member) => sum + Number(totals[member.username] || 0), 0);

  const contributionRows = contributors.map((member) => {
    const points = Number(totals[member.username] || 0);
    const share = totalClaimedPoints ? ((points / totalClaimedPoints) * 100).toFixed(1) : '0.0';
    return `
      <tr>
        <td>${escapeHtml(member.fullName || member.username)}</td>
        <td>${escapeHtml(getRoleLabel(member.role))}</td>
        <td>${points} pts</td>
        <td>${share}%</td>
      </tr>
    `;
  }).join('');

  receipt.innerHTML = `
    <div class="receipt-shell">
      <h1>PeerRater Contribution Receipt</h1>
      <p class="receipt-team"><strong>Team:</strong> ${escapeHtml(team.name)}</p>
      ${leader ? `
        <div class="receipt-leader">
          <span class="team-leader-tag">Team leader</span>
          <strong>${escapeHtml(leader.fullName || leader.username)}</strong>
        </div>
      ` : ''}
      <table>
        <thead>
          <tr><th>Name</th><th>Role</th><th>Points</th><th>Contribution</th></tr>
        </thead>
        <tbody>${contributionRows || '<tr><td colspan="4">No member contribution yet.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

/**
 * Renders hero section statistics
 * @param {Object} team - Team object
 * @param {Object} currentUser - Current user object
 */
function renderHeroStats(team, currentUser) {
  const logoEl = document.getElementById('heroTeamLogo');
  const cardLogoEl = document.getElementById('teamCardLogo');
  const leaderPill = document.getElementById('teamLeaderPill');

  const totalPointsEl = document.getElementById('statHeroTotalPoints');
  const totalTasksEl = document.getElementById('statHeroTotalTasks');
  const claimedTasksEl = document.getElementById('statHeroClaimedTasks');
  const membersEl = document.getElementById('statHeroMembers');

  if (!team || !currentUser) {
    const defaultLogo = generateTeamLogoDataUrl('Peer Team');
    if (logoEl) logoEl.src = defaultLogo;
    if (cardLogoEl) cardLogoEl.src = defaultLogo;
    return;
  }

  const logoSrc = getTeamLogo(team);
  if (logoEl) logoEl.src = logoSrc;
  if (cardLogoEl) cardLogoEl.src = logoSrc;

  const leaderAccount = readAccounts().find((a) => a.id === team.leaderId);
  if (leaderPill) {
    leaderPill.textContent = leaderAccount ? `Leader: ${leaderAccount.fullName || leaderAccount.username}` : 'Team Leader';
  }

  const board = getTeamBoard(team.id);
  const tasks = board.tasks || [];
  const claimedTasks = tasks.filter((t) => Boolean(t.claimedBy));
  const totalPoints = claimedTasks.reduce((sum, t) => sum + getTaskEffectivePoints(t), 0);
  const membersCount = (team.members || []).length;

  if (totalPointsEl) totalPointsEl.textContent = String(totalPoints);
  if (totalTasksEl) totalTasksEl.textContent = String(tasks.length);
  if (claimedTasksEl) claimedTasksEl.textContent = String(claimedTasks.length);
  if (membersEl) membersEl.textContent = String(membersCount);
}

/**
 * Renders the team switcher dropdown for multi-team users
 */
function renderTeamSwitcher() {
  const currentUser = getCurrentUser();
  const teamSwitchSelect = document.getElementById('teamSwitchSelect');
  if (!teamSwitchSelect || !currentUser) {
    return;
  }

  const teamIds = getUserTeamIds(currentUser);
  const teams = readTeams().filter((team) => teamIds.includes(team.id));
  if (!teams.length) {
    teamSwitchSelect.innerHTML = '<option value="">No team available</option>';
    teamSwitchSelect.disabled = true;
    return;
  }

  const activeTeamId = currentUser.activeTeamId || currentUser.teamId || teamIds[0];
  teamSwitchSelect.disabled = false;
  teamSwitchSelect.innerHTML = teams.map((team) => `
    <option value="${team.id}" ${team.id === activeTeamId ? 'selected' : ''}>${escapeHtml(team.name)}</option>
  `).join('');
  teamSwitchSelect.value = activeTeamId;
}

/**
 * Main render function - updates the entire application UI
 * Called after any state change to refresh the interface
 */
function renderApp() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    showAuthScreen();
    return;
  }

  showAppScreen();
  updateTopbarProfileImage();
  const team = getCurrentTeam();
  const isLeader = currentUser.role === 'team-leader';

  document.getElementById('teamRoleBadge').textContent = getRoleLabel(currentUser.role);
  document.getElementById('teamNameBadge').textContent = team ? team.name : 'No team yet';
  document.getElementById('currentTeamName').textContent = team ? team.name : 'No team yet';
  document.getElementById('teamHeadline').textContent = team
    ? `${team.name}: ${isLeader ? 'Leader dashboard' : 'Member dashboard'}`
    : `${isLeader ? 'Create your team' : 'Join a team'}: ${isLeader ? 'Leader dashboard' : 'Member dashboard'}`;

  document.getElementById('leaderControls').classList.toggle('hidden', !isLeader);
  document.getElementById('memberControls').classList.toggle('hidden', isLeader);
  document.getElementById('taskForm').classList.toggle('hidden', !isLeader || !team);
  renderTeamSwitcher();

  const chatToggle = document.getElementById('chatToggleButton');
  const hasChatAccess = Boolean(team && isTeamMemberOrLeader(currentUser, team));
  if (chatToggle) {
    if (!hasChatAccess) {
      chatToggle.disabled = true;
      chatToggle.title = team ? 'Chat is only accessible to team leaders and members' : 'Join or create a team to access chat';
      chatToggle.classList.add('disabled-toggle');
    } else {
      chatToggle.disabled = false;
      chatToggle.title = `Team Chat for ${team.name}`;
      chatToggle.classList.remove('disabled-toggle');
    }
  }

  if (team) {
    refreshBoardFromTeam(team.id);
  }

  renderHeroStats(team, currentUser);
  renderProfileSummary();
  renderTeamMembers();
  renderTaskAssigneeOptions();
  renderTaskList();
  renderChart();
  renderChatMessages();
  renderJoinRequestLists();
  renderMemberSearchResults();
}

function claimTask(taskIndex) {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role === 'team-leader') {
    return;
  }

  const team = getCurrentTeam();
  if (!team) {
    return;
  }

  const board = getTeamBoard(team.id);
  const task = board.tasks[taskIndex];
  if (!task || task.claimedBy || task.assignedTo !== currentUser.username) {
    return;
  }

  task.claimedBy = currentUser.username;
  task.claimedAt = new Date().toISOString();
  saveTeamBoard(team.id, board);
  renderApp();
}

/**
 * Removes a task from the current team board
 * @param {number} taskIndex - Index of task to remove
 */
function removeTask(taskIndex) {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'team-leader') {
    return;
  }

  const team = getCurrentTeam();
  if (!team) {
    return;
  }

  const board = getTeamBoard(team.id);
  const task = board.tasks[taskIndex];
  if (!task) {
    return;
  }

  board.tasks.splice(taskIndex, 1);
  saveTeamBoard(team.id, board);
  renderApp();
}

function openEditModal(taskIndex) {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'team-leader') {
    return;
  }

  const team = getCurrentTeam();
  if (!team) {
    return;
  }

  const board = getTeamBoard(team.id);
  const task = board.tasks[taskIndex];
  if (!task) {
    return;
  }

  taskBeingEditedIndex = taskIndex;
  const modal = document.getElementById('editModal');
  const titleInput = document.getElementById('editTaskName');
  const pointsInput = document.getElementById('editTaskPoints');
  const deadlineInput = document.getElementById('editTaskDeadline');

  titleInput.value = task.title;
  pointsInput.value = String(task.points);
  deadlineInput.value = task.deadline || '';
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  titleInput.focus();
}

function closeEditModal() {
  const modal = document.getElementById('editModal');
  if (!modal) {
    return;
  }
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  taskBeingEditedIndex = null;
}

function saveEditedTask(event) {
  event.preventDefault();
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'team-leader' || taskBeingEditedIndex === null) {
    return;
  }

  const team = getCurrentTeam();
  if (!team) {
    return;
  }

  const board = getTeamBoard(team.id);
  const task = board.tasks[taskBeingEditedIndex];
  const titleInput = document.getElementById('editTaskName');
  const pointsInput = document.getElementById('editTaskPoints');
  const deadlineInput = document.getElementById('editTaskDeadline');

  const trimmedTitle = normalizeText(titleInput.value);
  const parsedPoints = Number(pointsInput.value);
  const parsedDeadline = deadlineInput.value ? new Date(deadlineInput.value) : null;

  if (!trimmedTitle || !Number.isFinite(parsedPoints) || parsedPoints <= 0) {
    titleInput.focus();
    return;
  }

  if (deadlineInput.value && Number.isNaN(parsedDeadline.getTime())) {
    deadlineInput.focus();
    return;
  }

  task.title = trimmedTitle;
  task.points = parsedPoints;
  task.deadline = deadlineInput.value || null;
  saveTeamBoard(team.id, board);
  closeEditModal();
  renderApp();
}

function addTask(event) {
  event.preventDefault();
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'team-leader') {
    return;
  }

  const team = getCurrentTeam();
  if (!team) {
    return;
  }

  const titleInput = document.getElementById('taskName');
  const pointsInput = document.getElementById('taskPoints');
  const assigneeSelect = document.getElementById('taskAssignee');
  const deadlineInput = document.getElementById('taskDeadline');

  const title = normalizeText(titleInput.value);
  const points = Number(pointsInput.value);
  const assignedTo = assigneeSelect.value === 'unassigned' ? null : assigneeSelect.value;
  const parsedDeadline = deadlineInput.value ? new Date(deadlineInput.value) : null;

  if (!title || !Number.isFinite(points) || points <= 0) {
    return;
  }

  if (deadlineInput.value && Number.isNaN(parsedDeadline.getTime())) {
    deadlineInput.focus();
    return;
  }

  const board = getTeamBoard(team.id);
  board.tasks.push({
    id: makeId('task'),
    title,
    points,
    assignedTo,
    deadline: deadlineInput.value || null,
    claimedBy: null,
    claimedAt: null
  });

  saveTeamBoard(team.id, board);
  titleInput.value = '';
  pointsInput.value = '10';
  deadlineInput.value = '';
  setInputStatus('taskName', 'idle', '');
  renderApp();
}

function bindLiveValidationEvents() {
  const signupFullName = document.getElementById('signupFullName');
  if (signupFullName) {
    signupFullName.addEventListener('input', () => {
      const val = normalizeText(signupFullName.value);
      if (!val) {
        setInputStatus('signupFullName', 'idle', '');
        return;
      }
      if (val.length < 2) {
        setInputStatus('signupFullName', 'invalid', 'Name is too short');
        return;
      }
      setInputStatus('signupFullName', 'valid', 'Looks great');
      const signupUsername = document.getElementById('signupUsername');
      if (signupUsername && !signupUsername.value) {
        renderUsernameSuggestions(val);
      }
    });
  }

  const signupUsername = document.getElementById('signupUsername');
  if (signupUsername) {
    signupUsername.addEventListener('focus', () => {
      const base = signupUsername.value || signupFullName?.value || 'peer';
      renderUsernameSuggestions(base);
    });

    signupUsername.addEventListener('input', () => {
      const val = normalizeText(signupUsername.value);
      if (!val) {
        setInputStatus('signupUsername', 'idle', '');
        renderUsernameSuggestions(signupFullName?.value || 'peer');
        return;
      }
      if (val.length < 3) {
        setInputStatus('signupUsername', 'invalid', 'Username must be at least 3 characters');
        renderUsernameSuggestions(val);
        return;
      }
      if (isUsernameTaken(val)) {
        setInputStatus('signupUsername', 'invalid', 'Username is already taken');
        renderUsernameSuggestions(val);
        return;
      }
      setInputStatus('signupUsername', 'valid', 'Username is available');
      const container = document.getElementById('usernameSuggestions');
      if (container) container.classList.add('hidden');
    });
  }

  const signupPassword = document.getElementById('signupPassword');
  if (signupPassword) {
    signupPassword.addEventListener('input', () => {
      const val = signupPassword.value;
      if (!val) {
        setInputStatus('signupPassword', 'idle', '');
        return;
      }
      if (val.length < 6) {
        setInputStatus('signupPassword', 'invalid', 'Password must be at least 6 characters');
        return;
      }
      setInputStatus('signupPassword', 'valid', 'Password meets requirements');
    });
  }

  const signupTeamName = document.getElementById('signupTeamName');
  if (signupTeamName) {
    signupTeamName.addEventListener('focus', () => {
      renderTeamNameSuggestions(signupTeamName.value || 'Innovators');
    });

    signupTeamName.addEventListener('input', () => {
      const val = normalizeText(signupTeamName.value);
      if (!val) {
        setInputStatus('signupTeamName', 'idle', '');
        renderTeamNameSuggestions('Innovators');
        return;
      }
      if (val.length < 2) {
        setInputStatus('signupTeamName', 'invalid', 'Team name is too short');
        renderTeamNameSuggestions(val);
        return;
      }
      if (isTeamNameTaken(val)) {
        setInputStatus('signupTeamName', 'invalid', 'Team name is already taken');
        renderTeamNameSuggestions(val);
        return;
      }
      setInputStatus('signupTeamName', 'valid', 'Team name is available');
      const container = document.getElementById('teamNameSuggestions');
      if (container) container.classList.add('hidden');
    });
  }

  const teamNameInput = document.getElementById('teamNameInput');
  if (teamNameInput) {
    teamNameInput.addEventListener('input', () => {
      const val = normalizeText(teamNameInput.value);
      if (!val) {
        setInputStatus('teamNameInput', 'idle', '');
        return;
      }
      if (val.length < 2) {
        setInputStatus('teamNameInput', 'invalid', 'Team name is too short');
        return;
      }
      if (isTeamNameTaken(val)) {
        setInputStatus('teamNameInput', 'invalid', 'Team name is already taken');
        return;
      }
      setInputStatus('teamNameInput', 'valid', 'Team name is available');
    });
  }

  const taskName = document.getElementById('taskName');
  if (taskName) {
    taskName.addEventListener('input', () => {
      const val = normalizeText(taskName.value);
      if (!val) {
        setInputStatus('taskName', 'idle', '');
        return;
      }
      if (val.length < 3) {
        setInputStatus('taskName', 'invalid', 'Task name must be at least 3 characters');
        return;
      }
      setInputStatus('taskName', 'valid', 'Valid task name');
    });
  }
}

function bindEvents() {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('signupForm').addEventListener('submit', handleSignup);
  document.getElementById('signupRole').addEventListener('change', syncSignupRoleFields);
  document.getElementById('logoutButton').addEventListener('click', handleLogout);
  document.getElementById('printButton').addEventListener('click', () => window.print());

  const printReceiptBtn = document.getElementById('printReceiptBtn');
  if (printReceiptBtn) {
    printReceiptBtn.addEventListener('click', () => window.print());
  }

  document.getElementById('addMemberButton').addEventListener('click', addMemberFromLeader);
  document.getElementById('createTeamButton').addEventListener('click', createNewTeam);
  document.getElementById('searchTeamsButton').addEventListener('click', searchTeams);
  document.getElementById('teamSearchInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      searchTeams();
    }
  });
  document.getElementById('taskForm').addEventListener('submit', addTask);
  document.getElementById('editTaskForm').addEventListener('submit', saveEditedTask);

  const teamSwitchSelect = document.getElementById('teamSwitchSelect');
  if (teamSwitchSelect) {
    teamSwitchSelect.addEventListener('change', (event) => {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        return;
      }

      const nextTeamId = event.target.value;
      const nextUser = normalizeUserTeamState({ ...currentUser, activeTeamId: nextTeamId, teamId: nextTeamId });
      setCurrentUser(nextUser);
      renderApp();
    });
  }

  // Team Logo Zoom & Modal Triggers
  const teamLogoUploadInput = document.getElementById('teamLogoUploadInput');
  const heroTeamLogoWrap = document.getElementById('heroTeamLogoWrap');
  const heroTeamLogo = document.getElementById('heroTeamLogo');
  const teamCardLogo = document.getElementById('teamCardLogo');
  const modalChangeLogoBtn = document.getElementById('modalChangeLogoBtn');
  const modalRemoveLogoBtn = document.getElementById('modalRemoveLogoBtn');

  if (heroTeamLogoWrap) {
    heroTeamLogoWrap.addEventListener('click', openTeamLogoModal);
  }
  if (heroTeamLogo) {
    heroTeamLogo.addEventListener('click', openTeamLogoModal);
  }
  if (teamCardLogo) {
    teamCardLogo.addEventListener('click', openTeamLogoModal);
  }
  if (modalChangeLogoBtn && teamLogoUploadInput) {
    modalChangeLogoBtn.addEventListener('click', () => {
      closeTeamLogoModal();
      teamLogoUploadInput.click();
    });
  }
  if (modalRemoveLogoBtn) {
    modalRemoveLogoBtn.addEventListener('click', () => {
      removeTeamLogo();
      closeTeamLogoModal();
    });
  }
  if (teamLogoUploadInput) {
    teamLogoUploadInput.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      await saveTeamLogoFromFile(file);
      teamLogoUploadInput.value = '';
    });
  }

  // Chart Type Tabs
  document.querySelectorAll('.chart-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setChartType(btn.dataset.chartType);
    });
  });

  // Task Filter Tabs
  document.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      setTaskFilter(tab.dataset.taskFilter);
    });
  });

  // Live input validation & suggestions
  bindLiveValidationEvents();

  document.getElementById('memberName').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addMemberFromLeader();
    }
  });
  const profileMenuButton = document.getElementById('profileMenuButton');
  if (profileMenuButton) {
    profileMenuButton.addEventListener('click', () => toggleProfileMenu());
  }
  document.querySelectorAll('[data-profile-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.profileAction;
      if (action === 'upload') {
        handleProfileImageSelection('upload');
      } else if (action === 'camera') {
        handleProfileImageSelection('camera');
      } else if (action === 'remove') {
        removeProfileImage();
      }
      toggleProfileMenu(false);
    });
  });
  const profileUploadInput = document.getElementById('profileUploadInput');
  if (profileUploadInput) {
    profileUploadInput.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }
      await saveProfileImageFromFile(file);
    });
  }
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => toggleAuthTab(tab.dataset.authTab));
  });

  // Password Show / Hide toggling
  document.querySelectorAll('.password-toggle').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const targetId = button.dataset.target;
      const field = document.getElementById(targetId);
      if (!field) {
        return;
      }

      const isHidden = field.type === 'password';
      field.type = isHidden ? 'text' : 'password';
      button.textContent = isHidden ? 'Hide' : 'Show';
      button.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    });
  });

  // Modal Closures
  document.querySelectorAll('[data-close="true"]').forEach((element) => {
    element.addEventListener('click', () => {
      if (element.closest('#editModal')) {
        closeEditModal();
      } else if (element.closest('#chatModal')) {
        closeChatModal();
      } else if (element.closest('#teamLogoModal')) {
        closeTeamLogoModal();
      }
    });
  });

  document.addEventListener('click', (event) => {
    const profileMenu = document.getElementById('profileMenu');
    const profileButton = document.getElementById('profileMenuButton');
    if (!profileMenu || !profileButton) {
      return;
    }
    if (!profileButton.contains(event.target) && !profileMenu.contains(event.target)) {
      toggleProfileMenu(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeEditModal();
      closeChatModal();
      closeTeamLogoModal();
      toggleProfileMenu(false);
      toggleThemeMenu(false);
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Chat functionality
const CHAT_MESSAGES_KEY = 'peer-rater-chat-messages';

function getChatMessages(teamId) {
  if (!teamId) {
    return [];
  }
  const allMessages = getJson(CHAT_MESSAGES_KEY, {});
  return allMessages[teamId] || [];
}

function saveChatMessages(teamId, messages) {
  if (!teamId) {
    return;
  }
  const allMessages = getJson(CHAT_MESSAGES_KEY, {});
  allMessages[teamId] = messages;
  setJson(CHAT_MESSAGES_KEY, allMessages);
}

function updateChatModalHeader(team, currentUser) {
  const titleEl = document.getElementById('chatModalTitle');
  const subtitleEl = document.getElementById('chatModalSubtitle');
  if (titleEl) {
    titleEl.textContent = team ? `${team.name} Chat` : 'Team chat';
  }
  if (subtitleEl) {
    if (team && currentUser) {
      const isLeader = team.leaderId === currentUser.id;
      subtitleEl.textContent = isLeader ? 'Active as Team Leader • Team only' : 'Active as Team Member • Team only';
    } else {
      subtitleEl.textContent = 'Team leader & members only';
    }
  }
}

function sendChatMessage(text) {
  const currentUser = getCurrentUser();
  const team = getCurrentTeam();
  if (!currentUser || !team || !text) {
    return;
  }

  // Strict authorization check: Only team leader or members of this team
  if (!isTeamMemberOrLeader(currentUser, team)) {
    alert('Access restricted: Only the team leader and members of this team can post messages.');
    return;
  }

  const cleanText = normalizeText(text);
  if (!cleanText) {
    return;
  }

  const messages = getChatMessages(team.id);
  const senderName = getMemberDisplayName(team.id, currentUser.username);
  const senderPhoto = getProfilePhoto(currentUser);
  const isLeader = team.leaderId === currentUser.id;

  messages.push({
    id: makeId('msg'),
    teamId: team.id,
    senderId: currentUser.id,
    sender: currentUser.username,
    senderName,
    senderPhoto,
    senderRole: isLeader ? 'team-leader' : currentUser.role,
    text: cleanText,
    timestamp: Date.now()
  });

  saveChatMessages(team.id, messages);
  renderChatMessages();
  const input = document.getElementById('chatInput');
  if (input) {
    input.value = '';
  }
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

/**
 * Renders chat messages in the chat modal
 * Displays conversation history for the current team
 */
function renderChatMessages() {
  const currentUser = getCurrentUser();
  const team = getCurrentTeam();
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) {
    return;
  }

  const chatForm = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const sendBtn = chatForm ? chatForm.querySelector('button[type="submit"]') : null;

  if (!currentUser || !team || !isTeamMemberOrLeader(currentUser, team)) {
    chatMessages.innerHTML = `
      <div class="chat-restricted-state">
        <p><strong>🔒 Access Restricted</strong></p>
        <p>This chat is only accessible to the team leader and accepted members of <strong>${escapeHtml(team?.name || 'this team')}</strong>.</p>
      </div>
    `;
    if (input) input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    updateChatModalHeader(team, currentUser);
    return;
  }

  if (input) input.disabled = false;
  if (sendBtn) sendBtn.disabled = false;
  updateChatModalHeader(team, currentUser);

  const messages = getChatMessages(team.id);
  if (messages.length === 0) {
    chatMessages.innerHTML = `
      <div class="chat-empty-state">
        <span class="chat-empty-icon">💬</span>
        <p>No messages yet in <strong>${escapeHtml(team.name)}</strong>.</p>
        <p class="helper-text">Start the discussion with your team!</p>
      </div>
    `;
    return;
  }

  chatMessages.innerHTML = messages.map((msg) => {
    const isOwnMessage = msg.sender === currentUser.username || msg.senderId === currentUser.id;
    const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isLeader = msg.senderRole === 'team-leader' || (team.leaderId && team.leaderId === msg.senderId);
    const roleLabel = isLeader ? 'Leader' : 'Member';
    const roleBadgeClass = isLeader ? 'leader' : 'member';
    const senderPhoto = msg.senderPhoto || generateAvatarDataUrl(msg.sender, msg.senderName);

    return `
      <div class="chat-message ${isOwnMessage ? 'own-message' : 'other-message'}">
        <div class="message-header">
          <div class="message-sender">
            <img class="message-sender-avatar" src="${senderPhoto}" alt="${escapeHtml(msg.senderName)}" />
            <strong>${escapeHtml(msg.senderName)}</strong>
            <span class="chat-role-badge ${roleBadgeClass}">${roleLabel}</span>
          </div>
          <span class="message-time">${timeStr}</span>
        </div>
        <div class="message-text">${escapeHtml(msg.text)}</div>
      </div>
    `;
  }).join('');

  if (chatMessages.scrollTop === 0 || chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 50) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function openChatModal() {
  const currentUser = getCurrentUser();
  const team = getCurrentTeam();
  const modal = document.getElementById('chatModal');
  if (!modal) {
    return;
  }

  if (!currentUser) {
    alert('Please log in to access team chat.');
    return;
  }

  if (!team || !isTeamMemberOrLeader(currentUser, team)) {
    alert('Access restricted: Chat is only accessible to the team leader and members of this team.');
    return;
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  renderChatMessages();
  const input = document.getElementById('chatInput');
  if (input && !input.disabled) {
    input.focus();
  }
}

function closeChatModal() {
  const modal = document.getElementById('chatModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function bindChatEvents() {
  const chatToggle = document.getElementById('chatToggleButton');
  if (chatToggle) {
    chatToggle.addEventListener('click', openChatModal);
  }

  const chatForm = document.getElementById('chatForm');
  if (chatForm) {
    chatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = document.getElementById('chatInput');
      if (input && input.value.trim()) {
        sendChatMessage(input.value);
      }
    });
  }

  document.querySelectorAll('[data-close="true"]').forEach((element) => {
    if (element.closest('#chatModal')) {
      element.addEventListener('click', closeChatModal);
    }
  });
}


// Theme functionality
function setTheme(themeName) {
  const validThemes = ['light', 'dark', 'ocean', 'forest', 'sunset'];
  if (!validThemes.includes(themeName)) {
    themeName = 'light';
  }

  if (themeName === 'light') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', themeName);
  }

  localStorage.setItem(THEME_KEY, themeName);
  updateThemeMenuActiveState(themeName);
}

function getSavedTheme() {
  return localStorage.getItem(THEME_KEY) || 'light';
}

function updateThemeMenuActiveState(activeTheme) {
  document.querySelectorAll('.theme-menu-item').forEach((item) => {
    const itemTheme = item.dataset.theme;
    if (itemTheme === activeTheme) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

function toggleThemeMenu(show) {
  const menu = document.getElementById('themeMenu');
  const button = document.getElementById('themeMenuButton');
  if (!menu || !button) {
    return;
  }

  const isHidden = menu.classList.contains('hidden');
  const shouldShow = show === undefined ? isHidden : show;

  if (shouldShow) {
    menu.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
  } else {
    menu.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
  }
}

function initializeTheme() {
  const savedTheme = getSavedTheme();
  setTheme(savedTheme);
}

function bindThemeEvents() {
  const themeMenuButton = document.getElementById('themeMenuButton');
  if (themeMenuButton) {
    themeMenuButton.addEventListener('click', () => toggleThemeMenu());
  }

  document.querySelectorAll('.theme-menu-item').forEach((item) => {
    item.addEventListener('click', () => {
      const theme = item.dataset.theme;
      setTheme(theme);
      toggleThemeMenu(false);
    });
  });

  document.addEventListener('click', (event) => {
    const themeMenu = document.getElementById('themeMenu');
    const themeButton = document.getElementById('themeMenuButton');
    if (!themeMenu || !themeButton) {
      return;
    }
    if (!themeButton.contains(event.target) && !themeMenu.contains(event.target)) {
      toggleThemeMenu(false);
    }
  });
}

function bindButtonAnimations() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) {
      // Create ripple effect
      const ripple = document.createElement('span');
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = event.clientX - rect.left - size / 2;
      const y = event.clientY - rect.top - size / 2;

      ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: rgba(255, 255, 255, 0.4);
        border-radius: 50%;
        transform: scale(0);
        animation: rippleEffect 0.6s ease-out;
        pointer-events: none;
      `;

      button.style.position = 'relative';
      button.style.overflow = 'hidden';
      button.appendChild(ripple);

      setTimeout(() => {
        ripple.remove();
      }, 600);

      // Add click animation class
      button.classList.add('clicked');
      setTimeout(() => {
        button.classList.remove('clicked');
      }, 300);
    }
  });
}

function initializeApp() {
  ensureSeedData();
  syncTeamMemberships();
  bindEvents();
  bindChatEvents();
  bindThemeEvents();
  bindButtonAnimations();
  initializeTheme();
  syncSignupRoleFields();
  const currentUser = getCurrentUser();
  if (currentUser) {
    renderApp();
  } else {
    showAuthScreen();
  }
}

initializeApp();

