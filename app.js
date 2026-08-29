const ACCOUNTS_KEY = 'peer-rater-accounts';
const TEAMS_KEY = 'peer-rater-teams';
const BOARDS_KEY = 'peer-rater-team-boards';
const CURRENT_USER_KEY = 'peer-rater-current-user';
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

function ensureSeedData() {
  const accounts = getJson(ACCOUNTS_KEY, []);
  if (accounts.length) {
    return;
  }

  const teamId = makeId('team');
  const leaderId = makeId('user');
  const memberId = makeId('user');
  const leader = {
    id: leaderId,
    username: 'leader',
    password: 'leader123',
    role: 'team-leader',
    fullName: 'Team Leader',
    teamId
  };
  const member = {
    id: memberId,
    username: 'member',
    password: 'member123',
    role: 'team-member',
    fullName: 'Team Member',
    teamId
  };

  const team = {
    id: teamId,
    name: 'Demo Team',
    leaderId,
    members: [leaderId, memberId],
    createdAt: Date.now()
  };

  const board = {
    members: ['leader', 'member'],
    tasks: [
      { id: makeId('task'), title: 'Research sources', points: 10, assignedTo: 'leader', claimedBy: 'leader' },
      { id: makeId('task'), title: 'Draft intro page', points: 15, assignedTo: 'member', claimedBy: 'member' },
      { id: makeId('task'), title: 'Compile slides', points: 8, assignedTo: 'member', claimedBy: null }
    ],
    activeMember: 'leader'
  };

  setJson(ACCOUNTS_KEY, [leader, member]);
  setJson(TEAMS_KEY, [team]);
  const boardMap = {};
  boardMap[teamId] = board;
  setJson(BOARDS_KEY, boardMap);
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

function getCurrentUser() {
  const current = getJson(CURRENT_USER_KEY, null);
  if (!current || !current.id) {
    return null;
  }

  const account = readAccounts().find((item) => item.id === current.id) || null;
  return account;
}

function setCurrentUser(account) {
  if (!account) {
    localStorage.removeItem(CURRENT_USER_KEY);
    return;
  }

  setJson(CURRENT_USER_KEY, { id: account.id });
}

function getCurrentTeam() {
  const user = getCurrentUser();
  if (!user) {
    return null;
  }

  return readTeams().find((team) => team.id === user.teamId) || null;
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

function formatDateTime(value) {
  if (!value) {
    return 'No deadline';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'No deadline';
  }

  return parsed.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function isTaskClaimedAfterDeadline(task) {
  if (!task || !task.claimedBy || !task.deadline || !task.claimedAt) {
    return false;
  }

  const deadlineTime = new Date(task.deadline).getTime();
  const claimTime = new Date(task.claimedAt).getTime();
  if (Number.isNaN(deadlineTime) || Number.isNaN(claimTime)) {
    return false;
  }

  return claimTime > deadlineTime;
}

function getTaskContributionPoints(task) {
  if (!task || !task.claimedBy) {
    return 0;
  }

  const points = Number(task.points) || 0;
  return isTaskClaimedAfterDeadline(task) ? points / 2 : points;
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

function handleSignup(event) {
  event.preventDefault();

  const role = document.getElementById('signupRole').value;
  const fullName = normalizeText(document.getElementById('signupFullName').value);
  const username = normalizeText(document.getElementById('signupUsername').value);
  const password = normalizeText(document.getElementById('signupPassword').value);
  const teamName = normalizeText(document.getElementById('signupTeamName').value);

  if (!fullName || !username || !password || !teamName) {
    alert('Please complete all signup fields.');
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

  if (role === 'team-leader') {
    const teamId = makeId('team');
    const newUser = {
      id: makeId('user'),
      username,
      password,
      role,
      fullName,
      teamId
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

  const teams = readTeams();
  const matchingTeam = teams.find((team) => slugify(team.name) === slugify(teamName) || team.id === teamName);
  if (!matchingTeam) {
    alert('Team not found. Please ask the team leader for the exact team name or team code.');
    return;
  }

  const newUser = {
    id: makeId('user'),
    username,
    password,
    role,
    fullName,
    teamId: matchingTeam.id
  };

  accounts.push(newUser);
  matchingTeam.members.push(newUser.id);
  saveAccounts(accounts);
  saveTeams(teams);
  refreshBoardFromTeam(matchingTeam.id);
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

  currentUser.teamId = nextTeamId;
  const accounts = readAccounts().map((account) => account.id === currentUser.id ? currentUser : account);
  saveAccounts(accounts);
  teams.push(nextTeam);
  saveTeams(teams);
  saveTeamBoard(nextTeamId, { members: [currentUser.username], tasks: [], activeMember: currentUser.username });
  teamNameInput.value = '';
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
  const fullName = normalizeText(fullNameInput.value) || username;

  if (!username) {
    usernameInput.focus();
    return;
  }

  const accounts = readAccounts();
  if (accounts.some((account) => slugify(account.username) === slugify(username))) {
    alert('That username already exists. Choose a different username.');
    return;
  }

  let generatedPassword = `${username}_${Math.random().toString(36).slice(2, 8)}`;
  let passwordSuffix = 1;

  while (accounts.some((account) => account.password === generatedPassword)) {
    generatedPassword = `${username}_${passwordSuffix}_${Math.random().toString(36).slice(2, 6)}`;
    passwordSuffix += 1;
  }

  const newMember = {
    id: makeId('user'),
    username,
    password: generatedPassword,
    role: 'team-member',
    fullName,
    teamId: currentUser.teamId
  };

  const teams = readTeams();
  const currentTeam = teams.find((team) => team.id === currentUser.teamId);
  if (currentTeam) {
    if (!currentTeam.members.includes(newMember.id)) {
      currentTeam.members.push(newMember.id);
    }
  }

  accounts.push(newMember);
  saveAccounts(accounts);
  saveTeams(teams);
  refreshBoardFromTeam(currentUser.teamId);
  usernameInput.value = '';
  fullNameInput.value = '';
  alert(`Member added successfully. Username: ${username} | Password: ${generatedPassword}. Share this password with the new member.`);
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
  const currentTeam = teams.find((team) => team.id === currentUser.teamId);
  if (!currentTeam) {
    return;
  }

  const memberToRemove = readAccounts().find((account) => account.id === memberId);
  currentTeam.members = currentTeam.members.filter((id) => id !== memberId);

  const board = getTeamBoard(currentUser.teamId);
  board.tasks = (board.tasks || []).map((task) => {
    if (task.assignedTo === memberToRemove?.username) {
      return {
        ...task,
        assignedTo: null,
        claimedBy: task.claimedBy === memberToRemove.username ? null : task.claimedBy,
        claimedAt: task.claimedBy === memberToRemove.username ? null : task.claimedAt
      };
    }
    return task;
  });

  refreshBoardFromTeam(currentUser.teamId);
  saveTeams(teams);
  renderApp();
}

function renderTeamMembers() {
  const memberList = document.getElementById('memberList');
  const currentUser = getCurrentUser();
  const team = getCurrentTeam();
  if (!memberList || !team || !currentUser) {
    return;
  }

  const members = getTeamMembers(team.id);
  const isLeader = currentUser.role === 'team-leader';

  memberList.innerHTML = members.map((member) => {
    const canRemove = isLeader && member.id !== currentUser.id;
    return `
      <div class="member-item">
        <div>
          <strong>${escapeHtml(member.fullName || member.username)}</strong>
          <span class="member-role">${getRoleLabel(member.role)}</span>
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
    const isLateClaim = isTaskClaimedAfterDeadline(task);
    const isAssignedToCurrentUser = task.assignedTo === currentUser.username;
    const canClaim = !isLeader && isAssignedToCurrentUser && !isClaimed;
    const claimedByName = task.claimedBy ? getMemberDisplayName(team.id, task.claimedBy) : '';
    const assignedToName = task.assignedTo ? getMemberDisplayName(team.id, task.assignedTo) : '';
    const claimLabel = isLateClaim ? `Claimed after deadline by ${claimedByName}` : (isClaimed ? `Claimed by ${claimedByName}` : (canClaim ? `Claim for ${currentUser.username}` : 'Locked'));
    const claimDisabled = !canClaim || isClaimed ? 'disabled' : '';
    const statusText = isLateClaim ? `Claimed after deadline by ${claimedByName}` : (isClaimed ? `Completed by ${claimedByName}` : (task.assignedTo ? `Assigned to ${assignedToName}` : 'Unassigned'));
    const deadlineLabel = task.deadline ? formatDateTime(task.deadline) : 'No deadline set';
    const claimedTimeLabel = task.claimedAt ? formatDateTime(task.claimedAt) : 'Not recorded';

    return `
      <article class="task-card ${isLateClaim ? 'task-late' : ''}" data-index="${taskIndex}">
        <div class="task-topline">
          <h3 class="task-title">${escapeHtml(task.title)}</h3>
          <span class="task-points">${task.points} pts</span>
        </div>
        <div class="task-meta">
          <span class="status-dot" aria-hidden="true"></span>
          <span class="status-text">${statusText}</span>
        </div>
        <div class="task-meta task-detail-row">
          <span class="meta-pill">Deadline</span>
          <span class="status-text">${deadlineLabel}</span>
        </div>
        ${isLateClaim ? `
          <div class="task-meta task-detail-row">
            <span class="meta-pill late-pill">Late claim</span>
            <span class="status-text">${claimedTimeLabel}</span>
          </div>
        ` : isClaimed ? `
          <div class="task-meta task-detail-row">
            <span class="meta-pill claim-pill">Claim time</span>
            <span class="status-text">${claimedTimeLabel}</span>
          </div>
        ` : ''}
        <div class="task-actions">
          <button
            type="button"
            class="claim-button ${isClaimed ? 'claimed' : ''} ${isLateClaim ? 'late' : ''}"
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
  const totals = board.members.reduce((result, member) => {
    result[member] = 0;
    return result;
  }, {});

  board.tasks.forEach((task) => {
    if (task.claimedBy && totals[task.claimedBy] !== undefined) {
      totals[task.claimedBy] += getTaskContributionPoints(task);
    }
  });

  const teamMembers = getTeamMembers(team.id);
  const visibleMembers = teamMembers.filter((member) => member.role !== 'team-leader');
  const labels = visibleMembers.map((member) => member.username);
  const series = labels.map((member) => totals[member]);
  const canvas = document.getElementById('contributionChart');

  if (chartInstance) {
    chartInstance.destroy();
  }

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

  renderLegend(labels, series);
  document.getElementById('totalPoints').textContent = String(board.tasks.reduce((sum, task) => sum + Number(task.points || 0), 0));
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
      <table class="receipt-table">
        <thead>
          <tr><th>Name</th><th>Role</th><th>Points</th><th>Contribution</th></tr>
        </thead>
        <tbody>${contributionRows || '<tr><td colspan="4">No member contribution yet.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

function renderApp() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    showAuthScreen();
    return;
  }

  const team = getCurrentTeam();
  if (!team) {
    alert('Your account is not attached to a valid team. Please contact the team leader.');
    setCurrentUser(null);
    showAuthScreen();
    return;
  }

  refreshBoardFromTeam(team.id);
  showAppScreen();

  const isLeader = currentUser.role === 'team-leader';
  document.getElementById('teamRoleBadge').textContent = getRoleLabel(currentUser.role);
  document.getElementById('teamNameBadge').textContent = team.name;
  document.getElementById('currentTeamName').textContent = team.name;
  document.getElementById('teamHeadline').textContent = `${team.name}: ${isLeader ? 'Leader dashboard' : 'Member dashboard'}`;

  document.getElementById('leaderControls').classList.toggle('hidden', !isLeader);
  document.getElementById('memberControls').classList.toggle('hidden', isLeader);
  document.getElementById('taskForm').classList.toggle('hidden', !isLeader);
  renderTeamMembers();
  renderTaskAssigneeOptions();
  renderTaskList();
  renderChart();
  renderChatMessages();
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
  document.getElementById('logoutButton').addEventListener('click', handleLogout);
  document.getElementById('printButton').addEventListener('click', () => window.print());
  document.getElementById('addMemberButton').addEventListener('click', addMemberFromLeader);
  document.getElementById('createTeamButton').addEventListener('click', createNewTeam);
  document.getElementById('taskForm').addEventListener('submit', addTask);
  document.getElementById('editTaskForm').addEventListener('submit', saveEditedTask);
  document.getElementById('memberName').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addMemberFromLeader();
    }
  });
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
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeEditModal();
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
  const allMessages = getJson(CHAT_MESSAGES_KEY, {});
  return allMessages[teamId] || [];
}

function saveChatMessages(teamId, messages) {
  const allMessages = getJson(CHAT_MESSAGES_KEY, {});
  allMessages[teamId] = messages;
  setJson(CHAT_MESSAGES_KEY, allMessages);
}

function sendChatMessage(text) {
  const currentUser = getCurrentUser();
  const team = getCurrentTeam();
  if (!currentUser || !team || !text) {
    return;
  }

  const messages = getChatMessages(team.id);
  const senderName = getMemberDisplayName(team.id, currentUser.username);
  messages.push({
    id: makeId('msg'),
    sender: currentUser.username,
    senderName,
    senderRole: currentUser.role,
    text: normalizeText(text),
    timestamp: Date.now()
  });

  saveChatMessages(team.id, messages);
  renderChatMessages();
  document.getElementById('chatInput').value = '';
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function renderChatMessages() {
  const currentUser = getCurrentUser();
  const team = getCurrentTeam();
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages || !currentUser || !team) {
    return;
  }

  const messages = getChatMessages(team.id);
  chatMessages.innerHTML = messages.map((msg) => {
    const isOwnMessage = msg.sender === currentUser.username;
    const timeStr = new Date(msg.timestamp).toLocaleTimeString();
    return `
      <div class="chat-message ${isOwnMessage ? 'own-message' : 'other-message'}">
        <div class="message-header">
          <strong>${escapeHtml(msg.senderName)}</strong>
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
  const modal = document.getElementById('chatModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    renderChatMessages();
    document.getElementById('chatInput').focus();
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
      if (input.value.trim()) {
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


function initializeApp() {
  ensureSeedData();
  syncTeamMemberships();
  bindEvents();
  bindChatEvents();
  const currentUser = getCurrentUser();
  if (currentUser) {
    renderApp();
  } else {
    showAuthScreen();
  }
}

initializeApp();

