const ACCOUNTS_KEY = 'peer-rater-accounts';
const TEAMS_KEY = 'peer-rater-teams';
const BOARDS_KEY = 'peer-rater-team-boards';
const CURRENT_USER_KEY = 'peer-rater-current-user';
const REQUESTS_KEY = 'peer-rater-join-requests';
const THEME_KEY = 'peer-rater-theme';
const DEFAULT_COLORS = ['#4f46e5', '#22c55e', '#f97316', '#ec4899', '#f59e0b', '#06b6d4', '#8b5cf6', '#ef4444'];

let chartInstance = null;
let taskBeingEditedIndex = null;

function getJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function setJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function slugify(value) {
  return normalizeText(value).toLowerCase();
}

function readRequests() {
  return getJson(REQUESTS_KEY, []);
}

function saveRequests(requests) {
  setJson(REQUESTS_KEY, requests);
}

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

function isTaskLate(task) {
  if (!task || !task.claimedAt || !task.deadline) {
    return false;
  }
  return new Date(task.claimedAt).getTime() > new Date(task.deadline).getTime();
}

function getTaskEffectivePoints(task) {
  if (!task) {
    return 0;
  }
  const base = Number(task.points) || 0;
  return isTaskLate(task) ? base / 2 : base;
}

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

function getProfilePhoto(account) {
  if (!account) {
    return generateAvatarDataUrl('peer', 'Peer');
  }
  return account.profileImage || generateAvatarDataUrl(account.username, account.fullName || account.username);
}

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

function readAccounts() {
  return getJson(ACCOUNTS_KEY, []);
}

function saveAccounts(accounts) {
  setJson(ACCOUNTS_KEY, accounts);
}

function readTeams() {
  return getJson(TEAMS_KEY, []);
}

function saveTeams(teams) {
  setJson(TEAMS_KEY, teams);
}

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

function readBoards() {
  return getJson(BOARDS_KEY, {});
}

function saveBoards(boards) {
  setJson(BOARDS_KEY, boards);
}

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

function normalizeUserTeamState(account) {
  if (!account) {
    return null;
  }

  const teamIds = getUserTeamIds(account);
  const activeTeamId = teamIds.includes(account.activeTeamId) ? account.activeTeamId : teamIds[0] || null;
  const normalized = { ...account, teamIds, activeTeamId, teamId: activeTeamId };
  return normalized;
}

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

function isTeamMemberOrLeader(user, team) {
  if (!user || !team) {
    return false;
  }
  const isLeader = team.leaderId === user.id || (user.role === 'team-leader' && Array.isArray(team.members) && team.members.includes(user.id));
  const isMember = Array.isArray(team.members) && team.members.includes(user.id);
  return Boolean(isLeader || isMember);
}

function getTeamMembers(teamId) {
  const team = readTeams().find((item) => item.id === teamId);
  if (!team) {
    return [];
  }

  const accounts = readAccounts();
  return team.members.map((memberId) => accounts.find((account) => account.id === memberId)).filter(Boolean);
}

function getTeamMemberNames(teamId) {
  return getTeamMembers(teamId).map((member) => member.username);
}

function getMemberDisplayName(teamId, username) {
  if (!username) {
    return 'Unassigned';
  }

  const member = getTeamMembers(teamId).find((item) => item.username === username);
  return member?.fullName || member?.username || username;
}

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

function saveTeamBoard(teamId, board) {
  const boards = readBoards();
  boards[teamId] = board;
  saveBoards(boards);
}

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

function getRoleLabel(role) {
  return role === 'team-leader' ? 'Team Leader' : 'Team Member';
}

function showAuthScreen() {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
}

function showAppScreen() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
}

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

async function handleSignup(event) {
  event.preventDefault();

  const role = document.getElementById('signupRole').value;
  const fullName = normalizeText(document.getElementById('signupFullName').value);
  const username = normalizeText(document.getElementById('signupUsername').value);
  const password = normalizeText(document.getElementById('signupPassword').value);
  const teamName = normalizeText(document.getElementById('signupTeamName').value);

  if (!fullName || !username || !password) {
    alert('Please complete the required signup fields.');
    return;
  }

  if (role === 'team-leader' && !teamName) {
    alert('Team leaders must create a team name when signing up.');
    return;
  }

  const accounts = readAccounts();
  if (accounts.some((account) => slugify(account.username) === slugify(username))) {
    alert('That username is already taken. Please choose another one.');
    return;
  }

  if (accounts.some((account) => account.password === password)) {
    alert('That password is already in use. Please choose a different one.');
    return;
  }

  const profileImage = generateAvatarDataUrl(username, fullName);

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
      createdAt: Date.now()
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

  const teams = readTeams();
  if (teams.some((team) => slugify(team.name) === slugify(teamName))) {
    alert('A team with that name already exists. Please use a different name.');
    return;
  }

  const nextTeamId = makeId('team');
  const nextTeam = {
    id: nextTeamId,
    name: teamName,
    leaderId: currentUser.id,
    members: [currentUser.id],
    createdAt: Date.now()
  };

  const nextUser = normalizeUserTeamState({
    ...currentUser,
    teamIds: Array.from(new Set([...(currentUser.teamIds || getUserTeamIds(currentUser)), nextTeamId])),
    activeTeamId: nextTeamId,
    teamId: nextTeamId
  });

  const accounts = readAccounts().map((account) => account.id === currentUser.id ? nextUser : account);
  saveAccounts(accounts);
  teams.push(nextTeam);
  saveTeams(teams);
  saveTeamBoard(nextTeamId, { members: [currentUser.username], tasks: [], activeMember: currentUser.username });
  teamNameInput.value = '';
  setCurrentUser(nextUser);
  renderApp();
}

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

function renderMemberSearchResults() {
  const currentUser = getCurrentUser();
  const memberRequestList = document.getElementById('memberRequestList');
  if (!memberRequestList || !currentUser || currentUser.role !== 'team-member') {
    return;
  }
  searchTeams();
}

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

  const members = getTeamMembers(team.id);
  const isLeader = currentUser.role === 'team-leader';

  memberList.innerHTML = members.map((member) => {
    const canRemove = isLeader && member.id !== currentUser.id;
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

  memberList.querySelectorAll('.remove-member-button').forEach((button) => {
    button.addEventListener('click', () => {
      removeTeamMember(button.dataset.memberId);
    });
  });
}

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

function renderTaskList() {
  const currentUser = getCurrentUser();
  const team = getCurrentTeam();
  const tasksList = document.getElementById('taskList');

  if (!currentUser || !team) {
    tasksList.innerHTML = '<div class="empty-state">Please log in to continue.</div>';
    return;
  }

  const board = getTeamBoard(team.id);
  const isLeader = currentUser.role === 'team-leader';
  const visibleTasks = isLeader ? board.tasks : board.tasks.filter((task) => task.assignedTo === currentUser.username || task.claimedBy === currentUser.username);

  if (!visibleTasks.length) {
    tasksList.innerHTML = '<div class="empty-state">No tasks are available right now.</div>';
    return;
  }

  tasksList.innerHTML = visibleTasks.map((task, index) => {
    const taskIndex = board.tasks.indexOf(task);
    const isClaimed = Boolean(task.claimedBy);
    const isAssignedToCurrentUser = task.assignedTo === currentUser.username;
    const canClaim = !isLeader && isAssignedToCurrentUser && !isClaimed;
    const claimedByName = task.claimedBy ? getMemberDisplayName(team.id, task.claimedBy) : '';
    const assignedToName = task.assignedTo ? getMemberDisplayName(team.id, task.assignedTo) : '';
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
      <article class="task-card ${lateClaim ? 'late-task' : ''}" data-index="${taskIndex}">
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
          ${task.claimedAt ? `<span class="claim-time-pill">Claimed at: ${formatDateTime(task.claimedAt)}</span>` : ''}
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

  const labels = visibleMembers.map((member) => member.username);
  const series = labels.map((member) => totals[member] || 0);
  const canvas = document.getElementById('contributionChart');

  if (chartInstance) {
    chartInstance.destroy();
  }

  if (canvas) {
    chartInstance = new Chart(canvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data: series,
          backgroundColor: labels.map((_, idx) => DEFAULT_COLORS[idx % DEFAULT_COLORS.length]),
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                const { label, parsed, dataset } = context;
                const total = dataset.data.reduce((sum, value) => sum + Number(value), 0);
                const share = total ? ((parsed / total) * 100).toFixed(1) : '0.0';
                return `${label}: ${parsed} pts (${share}%)`;
              }
            }
          }
        }
      }
    });
  }

  renderLegend(labels, series);
  const totalContributionPoints = series.reduce((sum, value) => sum + Number(value || 0), 0);
  document.getElementById('totalPoints').textContent = String(totalContributionPoints);
  renderPrintReceipt(team, teamMembers, totals);
}

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
        <strong>${share}%</strong>
      </div>
    `;
  }).join('');
}

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
      <h1>PeerRater contribution receipt</h1>
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
  renderApp();
}

function bindEvents() {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('signupForm').addEventListener('submit', handleSignup);
  document.getElementById('signupRole').addEventListener('change', syncSignupRoleFields);
  document.getElementById('logoutButton').addEventListener('click', handleLogout);
  document.getElementById('printButton').addEventListener('click', () => window.print());
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
  document.querySelectorAll('.password-toggle').forEach((button) => {
    button.addEventListener('click', () => {
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
  document.querySelectorAll('[data-close="true"]').forEach((element) => {
    element.addEventListener('click', () => {
      if (element.closest('#editModal')) {
        closeEditModal();
      } else if (element.closest('#chatModal')) {
        closeChatModal();
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

