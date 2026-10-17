let currentUser = null;
let currentTasks = [];
let taskFilter = 'all';
let editingTaskId = null;

const todayKey = () => {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
};

function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (networkErr) {
    throw new Error(
      'Cannot reach the server. Run "npm start" in the FCC folder, then open http://localhost:3000 in your browser.'
    );
  }
  if (res.status === 401) {
    window.location.href = 'index.html';
    throw new Error('Please sign in.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

function newerTask(a, b) {
  const ca = a.created_at || '';
  const cb = b.created_at || '';
  if (ca !== cb) return ca < cb ? 1 : -1;
  return String(b.task_id).localeCompare(String(a.task_id));
}

function sortTasks(list, mode) {
  const copy = [...list];
  if (mode === 'smart') {
    copy.sort((a, b) => {
      const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (p !== 0) return p;
      const da = a.due_date ? a.due_date : '9999-12-31';
      const db = b.due_date ? b.due_date : '9999-12-31';
      if (da !== db) return da < db ? -1 : 1;
      return newerTask(a, b);
    });
  } else if (mode === 'deadline') {
    copy.sort((a, b) => {
      const da = a.due_date ? a.due_date : '9999-12-31';
      const db = b.due_date ? b.due_date : '9999-12-31';
      return da < db ? -1 : da > db ? 1 : newerTask(a, b);
    });
  } else if (mode === 'priority') {
    copy.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || newerTask(a, b));
  } else {
    copy.sort(newerTask);
  }
  return copy;
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function setEmptyNote(noteEl, listEl, isEmpty) {
  noteEl.classList.toggle('visible', isEmpty);
}

/* ---------- tabs ---------- */

const tabs = document.querySelectorAll('.tab');
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.panel').forEach((p) => {
      p.classList.toggle('active', p.id === 'section-' + tab.dataset.section);
    });
  });
});

/* ---------- overview ---------- */

async function loadOverview() {
  const [profileData, taskData] = await Promise.all([
    api('/api/profile'),
    api('/api/tasks'),
  ]);
  const { stats } = profileData;
  document.getElementById('nav-name').textContent = currentUser.fullName;
  document.getElementById('overview-name').textContent = currentUser.fullName.split(' ')[0];
  document.getElementById('stat-focus').textContent = fmtClock(stats.todayMinutes * 60);
  document.getElementById('stat-sessions').textContent = stats.todaySessions;
  document.getElementById('stat-tasks').textContent = stats.tasksCompleted;
  document.getElementById('stat-streak').textContent = stats.streak;

  const all = taskData.tasks;
  const overdue = all.filter((t) => t.status === 'Pending' && t.due_date && t.due_date < todayKey());
  const pending = sortTasks(
    all.filter((t) => t.status === 'Pending'),
    'smart'
  );
  const next = pending[0];
  const titleEl = document.getElementById('next-task-title');
  const metaEl = document.getElementById('next-task-meta');
  if (next) {
    titleEl.textContent = truncate(next.title, 38);
    const bits = [next.priority + ' priority'];
    if (next.due_date) bits.push('due ' + next.due_date);
    if (overdue.length) bits.push(overdue.length + ' overdue');
    metaEl.textContent = bits.join(' · ');
  } else {
    titleEl.textContent = 'No pending tasks — add one in the Tasks tab.';
    metaEl.textContent = '';
  }
}

/* ---------- daily intention ---------- */

const intentionForm = document.getElementById('intention-form');
const intentionText = document.getElementById('intention-text');
const intentionModeSelect = document.getElementById('intention-mode');
const intentionModeHelp = document.getElementById('intention-mode-help');
const intentionTaskSelect = document.getElementById('intention-task');
const intentionSubmit = document.getElementById('intention-submit');
const intentionHint = document.getElementById('intention-hint');
const intentionProgress = document.getElementById('intention-progress');
const intentionProgressFill = document.getElementById('intention-progress-fill');
const intentionList = document.getElementById('intention-list');
const intentionsEmpty = document.getElementById('intentions-empty');
let intentionDirty = false;
let availableIntentionTasks = new Map();
let currentGoals = [];
let loadedIntentionDate = null;
let activeGoalEdit = null;

function markIntentionDirty() {
  intentionDirty = true;
  intentionHint.textContent = 'You have unsaved changes.';
  intentionHint.className = 'hint';
}

function updateIntentionInputMode() {
  const usesTask = intentionModeSelect.value === 'task';
  intentionText.hidden = usesTask;
  intentionText.required = !usesTask;
  intentionTaskSelect.hidden = !usesTask;
  intentionTaskSelect.required = usesTask;
  intentionModeHelp.textContent = usesTask
    ? 'Track your progress automatically when you complete this task.'
    : "Set a daily goal that isn't tied to a single task.";
}

function goalIsAchieved(goal) {
  if (goal.task_id) return Boolean(goal.task && goal.task.status === 'Completed');
  return Boolean(goal.achieved);
}

function showIntentionMessage(message, state = '') {
  intentionHint.textContent = message;
  intentionHint.className = 'hint' + (state ? ' ' + state : '');
}

function replaceGoal(updatedGoal) {
  currentGoals = currentGoals.map((goal) =>
    goal.goal_id === updatedGoal.goal_id ? updatedGoal : goal
  );
  renderGoals();
}

function renderGoals() {
  intentionList.replaceChildren();
  if (activeGoalEdit && !currentGoals.some((goal) => goal.goal_id === activeGoalEdit.goalId)) {
    activeGoalEdit = null;
  }
  let completed = 0;

  currentGoals.forEach((goal) => {
    const achieved = goalIsAchieved(goal);
    if (achieved) completed += 1;

    const item = document.createElement('li');
    item.className = 'intention-item' + (achieved ? ' achieved' : '');
    if (activeGoalEdit && activeGoalEdit.goalId === goal.goal_id) {
      item.appendChild(createGoalEditForm(goal, activeGoalEdit.text));
      intentionList.appendChild(item);
      return;
    }

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'intention-goal-check';
    check.checked = achieved;
    check.disabled = Boolean(goal.task_id);
    check.setAttribute('aria-label',
      goal.task_id
        ? 'Task completion status for ' + goal.text
        : 'Mark ' + goal.text + ' as achieved'
    );
    if (!goal.task_id) {
      check.addEventListener('change', () => updateGoalAchievement(goal, check));
    }

    const details = document.createElement('div');
    details.className = 'intention-goal-details';
    const text = document.createElement('p');
    text.className = 'intention-goal-text';
    text.textContent = goal.text;
    details.appendChild(text);
    if (goal.task_id && goal.task) {
      const taskRef = document.createElement('p');
      taskRef.className = 'intention-goal-task';
      taskRef.textContent = 'Task: ' + goal.task.title;
      details.appendChild(taskRef);
    }

    const status = document.createElement('span');
    status.className = 'intention-goal-status ' + (achieved ? 'achieved' : 'progress');
    if (goal.task_id && !goal.task) {
      status.className = 'intention-goal-status unavailable';
      status.textContent = 'In progress · task unavailable';
    } else if (goal.task_id) {
      status.textContent = achieved ? 'Achieved' : 'Task in progress';
    } else {
      status.textContent = achieved ? 'Achieved' : 'In progress';
    }

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'icon-btn';
    edit.textContent = 'Edit';
    edit.setAttribute('aria-label', 'Edit goal: ' + goal.text);
    edit.addEventListener('click', () => editGoal(goal));

    item.append(check, details, status, edit);
    intentionList.appendChild(item);
  });

  intentionProgress.textContent = completed + ' of ' + currentGoals.length +
    (currentGoals.length === 1 ? ' goal completed' : ' goals completed');
  const progressPercent = currentGoals.length ? (completed / currentGoals.length) * 100 : 0;
  intentionProgressFill.style.width = progressPercent + '%';
  intentionsEmpty.classList.toggle('visible', currentGoals.length === 0);
}

async function updateGoalAchievement(goal, checkbox) {
  const achieved = checkbox.checked;
  checkbox.disabled = true;
  try {
    const data = await api('/api/intentions/' + encodeURIComponent(goal.goal_id) + '/achievement', {
      method: 'PUT',
      body: JSON.stringify({ achieved }),
    });
    replaceGoal(data.goal);
    showIntentionMessage(achieved ? 'Goal marked as achieved.' : 'Goal marked as in progress.', achieved ? 'ok' : '');
  } catch (err) {
    checkbox.checked = !achieved;
    checkbox.disabled = false;
    showIntentionMessage(err.message, 'error');
  }
}

function createGoalEditForm(goal, initialText) {
  const form = document.createElement('form');
  form.className = 'intention-edit-form';
  const input = document.createElement('textarea');
  input.className = 'intention-edit-input';
  input.value = initialText;
  input.maxLength = 500;
  input.rows = 2;
  input.required = true;
  input.setAttribute('aria-label', 'Edit goal text');
  input.addEventListener('input', () => {
    if (activeGoalEdit && activeGoalEdit.goalId === goal.goal_id) activeGoalEdit.text = input.value;
  });

  const actions = document.createElement('div');
  actions.className = 'intention-edit-actions';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn btn-primary';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn-secondary';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => {
    activeGoalEdit = null;
    renderGoals();
  });

  actions.append(save, cancel);
  form.append(input, actions);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) {
      showIntentionMessage('Enter a goal before saving.', 'error');
      input.focus();
      return;
    }
    save.disabled = true;
    showIntentionMessage('Saving goal…');
    try {
      const data = await api('/api/intentions/' + encodeURIComponent(goal.goal_id), {
        method: 'PUT',
        body: JSON.stringify({ text }),
      });
      activeGoalEdit = null;
      replaceGoal(data.goal);
      showIntentionMessage('Goal updated.', 'ok');
    } catch (err) {
      save.disabled = false;
      showIntentionMessage(err.message, 'error');
    }
  });
  return form;
}

function editGoal(goal) {
  activeGoalEdit = { goalId: goal.goal_id, text: goal.text };
  renderGoals();
  const input = intentionList.querySelector('.intention-edit-input');
  if (input) input.focus();
}

intentionText.addEventListener('input', markIntentionDirty);
intentionModeSelect.addEventListener('change', () => {
  markIntentionDirty();
  updateIntentionInputMode();
});
intentionTaskSelect.addEventListener('change', markIntentionDirty);

async function loadIntention() {
  intentionSubmit.disabled = true;
  showIntentionMessage("Loading today's goals…");
  try {
    const [data, taskData] = await Promise.all([
      api('/api/intentions/today'),
      api('/api/tasks?filter=all'),
    ]);
    if (loadedIntentionDate !== null && loadedIntentionDate !== data.date) {
      intentionDirty = false;
      activeGoalEdit = null;
      intentionText.value = '';
      intentionTaskSelect.value = '';
    }
    loadedIntentionDate = data.date;
    const selectedTaskId = intentionTaskSelect.value;
    availableIntentionTasks = new Map(taskData.tasks.map((task) => [task.task_id, task]));
    intentionTaskSelect.replaceChildren(new Option('Select a task', ''));
    taskData.tasks.forEach((task) => {
      const label = (task.status === 'Completed' ? '✓ ' : '') + task.title;
      intentionTaskSelect.add(new Option(label, task.task_id));
    });
    if (selectedTaskId && !availableIntentionTasks.has(selectedTaskId)) {
      intentionTaskSelect.add(new Option('Unavailable linked task', selectedTaskId, true, true));
    }
    intentionTaskSelect.value = selectedTaskId;
    updateIntentionInputMode();
    currentGoals = data.goals;
    renderGoals();
    showIntentionMessage(intentionDirty ? 'You have unsaved changes.' : "Today's goals are up to date.");
    intentionSubmit.disabled = false;
  } catch (err) {
    showIntentionMessage(err.message, 'error');
    intentionSubmit.disabled = false;
  }
}

intentionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const taskId = intentionModeSelect.value === 'task' ? intentionTaskSelect.value : '';
  const text = intentionText.value.trim();
  if (intentionModeSelect.value === 'task' && !taskId) {
    intentionHint.textContent = 'Choose a task before saving.';
    intentionHint.className = 'hint error';
    intentionTaskSelect.focus();
    return;
  }
  if (taskId && !availableIntentionTasks.has(taskId)) {
    intentionHint.textContent = 'That task is no longer available. Choose another task or a custom intention.';
    intentionHint.className = 'hint error';
    return;
  }
  if (!taskId && !text) {
    intentionHint.textContent = 'Enter an intention before saving.';
    intentionHint.className = 'hint error';
    intentionText.focus();
    return;
  }
  intentionSubmit.disabled = true;
  showIntentionMessage('Adding goal…');
  try {
    const data = await api('/api/intentions/today', {
      method: 'POST',
      body: JSON.stringify(taskId ? { taskId } : { text }),
    });
    currentGoals.push(data.goal);
    renderGoals();
    intentionText.value = '';
    intentionDirty = false;
    loadedIntentionDate = data.goal.date;
    showIntentionMessage('Goal added.', 'ok');
  } catch (err) {
    showIntentionMessage(err.message, 'error');
  } finally {
    intentionSubmit.disabled = false;
  }
});

/* ---------- timer ---------- */

const RING_LENGTH = 552.9;
const timer = {
  state: 'idle',
  plannedSeconds: 0,
  elapsed: 0,
  startedAt: 0,
  sessionId: null,
  ticker: null,
};

const ringFill = document.getElementById('ring-fill');
const readout = document.getElementById('timer-readout');
const hoursInput = document.getElementById('hours');
const minutesInput = document.getElementById('minutes');
const secondsInput = document.getElementById('seconds');
const startBtn = document.getElementById('timer-start');
const pauseBtn = document.getElementById('timer-pause');
const stopBtn = document.getElementById('timer-stop');

function plannedFromInputs() {
  return (
    (Number(hoursInput.value) || 0) * 3600 +
    (Number(minutesInput.value) || 0) * 60 +
    (Number(secondsInput.value) || 0)
  );
}

function renderTimer() {
  const remaining = Math.max(0, timer.plannedSeconds - timer.elapsed);
  readout.textContent = fmtClock(remaining);
  const progress = timer.plannedSeconds ? timer.elapsed / timer.plannedSeconds : 0;
  ringFill.style.strokeDashoffset = String(RING_LENGTH * (1 - progress));
}

function setTimerInputsDisabled(disabled) {
  [hoursInput, minutesInput, secondsInput].forEach((el) => (el.disabled = disabled));
}

function startTicking() {
  timer.startedAt = Date.now() - timer.elapsed * 1000;
  timer.ticker = setInterval(() => {
    timer.elapsed = Math.floor((Date.now() - timer.startedAt) / 1000);
    if (timer.elapsed >= timer.plannedSeconds) {
      timer.elapsed = timer.plannedSeconds;
      renderTimer();
      completeTimer();
      return;
    }
    renderTimer();
  }, 250);
}

function stopTicking() {
  clearInterval(timer.ticker);
  timer.ticker = null;
}

async function saveTimerState(status) {
  if (!timer.sessionId) return;
  try {
    await api('/api/sessions/' + timer.sessionId, {
      method: 'PUT',
      body: JSON.stringify({ elapsedSeconds: timer.elapsed, status }),
    });
  } catch (err) {
    console.error(err);
  }
}

async function startTimer() {
  const planned = plannedFromInputs();
  if (planned < 1 || planned > 86400) {
    alert('Set a duration of at least 1 second (max 24 hours).');
    return;
  }
  try {
    const data = await api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ plannedMinutes: Math.ceil(planned / 60) }),
    });
    timer.sessionId = data.session.session_id;
    timer.state = 'running';
    timer.plannedSeconds = planned;
    timer.elapsed = 0;
    renderTimer();
    setTimerInputsDisabled(true);
    startTicking();
    pauseBtn.disabled = false;
    pauseBtn.textContent = 'Pause';
    stopBtn.disabled = false;
    startBtn.disabled = true;
    startBtn.textContent = 'Running…';
  } catch (err) {
    alert(err.message);
  }
}

async function pauseResume() {
  if (timer.state === 'running') {
    stopTicking();
    timer.state = 'paused';
    pauseBtn.textContent = 'Resume';
    await saveTimerState('Paused');
  } else if (timer.state === 'paused') {
    timer.state = 'running';
    pauseBtn.textContent = 'Pause';
    startTicking();
    await saveTimerState('Active');
  }
}

async function completeTimer() {
  stopTicking();
  timer.state = 'idle';
  await saveTimerState('Completed');
  resetTimerUI();
  alert('Focus session complete. Well done!');
  refreshData();
}

async function stopTimer() {
  if (!confirm('Stop this session and reset the timer?')) return;
  stopTicking();
  timer.state = 'idle';
  await saveTimerState('Stopped');
  resetTimerUI();
  refreshData();
}

function resetTimerUI() {
  timer.sessionId = null;
  timer.elapsed = 0;
  renderTimer();
  setTimerInputsDisabled(false);
  pauseBtn.disabled = true;
  pauseBtn.textContent = 'Pause';
  stopBtn.disabled = true;
  startBtn.disabled = false;
  startBtn.textContent = 'Start';
}

startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseResume);
stopBtn.addEventListener('click', stopTimer);
renderTimer();

/* ---------- tasks ---------- */

const taskForm = document.getElementById('task-form');
const taskTitle = document.getElementById('task-title');
const taskPriority = document.getElementById('task-priority');
const taskDue = document.getElementById('task-due');
const taskSubmitBtn = document.getElementById('task-submit');
const taskList = document.getElementById('task-list');
const tasksEmpty = document.getElementById('tasks-empty');
const taskSort = document.getElementById('task-sort');

async function loadTasks() {
  const data = await api('/api/tasks?filter=' + taskFilter);
  currentTasks = data.tasks;
  renderTasks();
}

function renderTasks() {
  const sorted = sortTasks(currentTasks, taskSort.value);
  taskList.innerHTML = '';
  sorted.forEach((task) => {
    const li = document.createElement('li');
    li.className = 'task-item';

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'task-check';
    check.checked = task.status === 'Completed';
    check.title = 'Toggle completed';
    check.addEventListener('change', async () => {
      await api('/api/tasks/' + task.task_id, {
        method: 'PUT',
        body: JSON.stringify({ status: check.checked ? 'Completed' : 'Pending' }),
      });
      refreshData();
    });

    const body = document.createElement('div');
    body.className = 'task-body';
    const title = document.createElement('p');
    title.className = 'task-title' + (task.status === 'Completed' ? ' done' : '');
    title.textContent = task.title;
    const meta = document.createElement('div');
    meta.className = 'task-meta';
    const priorityBadge = document.createElement('span');
    priorityBadge.className = 'badge ' + task.priority.toLowerCase();
    priorityBadge.textContent = task.priority;
    meta.appendChild(priorityBadge);
    if (task.due_date) {
      const due = document.createElement('span');
      due.textContent = 'due ' + task.due_date;
      if (task.status === 'Pending' && task.due_date < todayKey()) {
        due.className = 'badge overdue';
        due.textContent = 'overdue · ' + task.due_date;
      }
      meta.appendChild(due);
    }
    body.appendChild(title);
    body.appendChild(meta);

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => beginEditTask(task));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete this task?')) return;
      await api('/api/tasks/' + task.task_id, { method: 'DELETE' });
      if (editingTaskId === task.task_id) cancelEditTask();
      refreshData();
    });

    li.appendChild(check);
    li.appendChild(body);
    li.appendChild(editBtn);
    li.appendChild(deleteBtn);
    taskList.appendChild(li);
  });
  setEmptyNote(tasksEmpty, taskList, sorted.length === 0);
}

function beginEditTask(task) {
  editingTaskId = task.task_id;
  taskTitle.value = task.title;
  taskPriority.value = task.priority;
  taskDue.value = task.due_date || '';
  taskSubmitBtn.textContent = 'Save task';
  taskTitle.focus();
}

function cancelEditTask() {
  editingTaskId = null;
  taskForm.reset();
  taskSubmitBtn.textContent = 'Add task';
}

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = taskTitle.value.trim();
  if (!title) return;
  const payload = { title, priority: taskPriority.value, dueDate: taskDue.value || null };
  try {
    if (editingTaskId) {
      await api('/api/tasks/' + editingTaskId, { method: 'PUT', body: JSON.stringify(payload) });
      cancelEditTask();
    } else {
      await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
      taskForm.reset();
      taskPriority.value = 'Medium';
    }
    refreshData();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('task-filters').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('#task-filters .chip').forEach((c) =>
    c.classList.toggle('active', c === chip)
  );
  taskFilter = chip.dataset.filter;
  loadTasks();
});

taskSort.addEventListener('change', renderTasks);

/* ---------- history ---------- */

let histRange = 'today';
const HISTORY_TITLES = {
  today: "Today's sessions",
  week: 'Sessions — last 7 days',
  all: 'All sessions',
};

async function loadHistory() {
  const data = await api('/api/sessions?range=' + histRange);
  document.getElementById('hist-total').textContent = fmtClock(data.totals.total_seconds);
  document.getElementById('hist-count').textContent = data.totals.n;
  document.getElementById('hist-completed').textContent = data.totals.completed;

  const list = document.getElementById('history-list');
  list.innerHTML = '';
  data.sessions.forEach((s) => {
    const li = document.createElement('li');
    li.className = 'task-item';

    const body = document.createElement('div');
    body.className = 'task-body';
    const title = document.createElement('p');
    title.className = 'task-title';
    title.textContent =
      s.mode + ' · planned ' + s.duration_minutes + ' min · focused ' + fmtClock(s.elapsed_seconds);
    const meta = document.createElement('div');
    meta.className = 'task-meta';
    meta.textContent = s.start_time + (s.end_time ? ' → ' + s.end_time : '');
    body.appendChild(title);
    body.appendChild(meta);

    const badge = document.createElement('span');
    badge.className = 'badge status-' + s.status.toLowerCase();
    badge.textContent = s.status;

    li.appendChild(body);
    li.appendChild(badge);
    list.appendChild(li);
  });
  setEmptyNote(document.getElementById('history-empty'), list, data.sessions.length === 0);
}

document.getElementById('history-ranges').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('#history-ranges .chip').forEach((c) =>
    c.classList.toggle('active', c === chip)
  );
  histRange = chip.dataset.range;
  document.getElementById('history-title').textContent = HISTORY_TITLES[histRange];
  loadHistory();
});

/* ---------- analytics ---------- */

async function loadAnalytics() {
  const data = await api('/api/analytics/weekly');
  const chart = document.getElementById('weekly-chart');
  chart.innerHTML = '';
  const max = Math.max(...data.days.map((d) => d.minutes), 1);
  data.days.forEach((d) => {
    const col = document.createElement('div');
    col.className = 'chart-col';
    const value = document.createElement('span');
    value.className = 'chart-value';
    value.textContent = d.minutes ? d.minutes + 'm' : '';
    const bar = document.createElement('div');
    bar.className = 'chart-bar' + (d.minutes ? '' : ' empty');
    bar.style.height = Math.max(3, Math.round((d.minutes / max) * 150)) + 'px';
    const day = document.createElement('span');
    day.className = 'chart-day';
    const [y, m, dd] = d.date.split('-').map(Number);
    day.textContent = new Date(y, m - 1, dd).toLocaleDateString('en-US', { weekday: 'short' });
    col.appendChild(value);
    col.appendChild(bar);
    col.appendChild(day);
    chart.appendChild(col);
  });
  document.getElementById('week-total').textContent = data.totalMinutes + ' min';
  document.getElementById('week-completed').textContent = data.completedSessions;
  document.getElementById('week-avg').textContent = data.dailyAverage + ' min';
  document.getElementById('week-best').textContent = data.mostProductiveDay || '—';
}

/* ---------- journal ---------- */

const journalForm = document.getElementById('journal-form');
const journalSearch = document.getElementById('journal-search');
const journalList = document.getElementById('journal-list');
const journalEmpty = document.getElementById('journal-empty');

async function loadJournal() {
  const q = journalSearch.value.trim();
  const data = await api('/api/journal' + (q ? '?q=' + encodeURIComponent(q) : ''));
  journalList.innerHTML = '';
  data.entries.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'journal-item';
    const title = document.createElement('p');
    title.className = 'journal-title';
    title.textContent = entry.title;
    const date = document.createElement('p');
    date.className = 'journal-date';
    date.textContent = entry.entry_date;
    li.appendChild(title);
    li.appendChild(date);
    if (entry.notes) {
      const notes = document.createElement('p');
      notes.className = 'journal-notes';
      notes.textContent = entry.notes;
      li.appendChild(notes);
    }
    journalList.appendChild(li);
  });
  setEmptyNote(journalEmpty, journalList, data.entries.length === 0);
}

journalForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/journal', {
      method: 'POST',
      body: JSON.stringify({
        title: document.getElementById('journal-title').value.trim(),
        notes: document.getElementById('journal-notes').value.trim(),
      }),
    });
    journalForm.reset();
    loadJournal();
    alert('Journal entry saved.');
  } catch (err) {
    alert(err.message);
  }
});

let searchTimer = null;
journalSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadJournal, 250);
});

/* ---------- profile ---------- */

const dateKeyOf = (d) =>
  d.getFullYear() +
  '-' +
  String(d.getMonth() + 1).padStart(2, '0') +
  '-' +
  String(d.getDate()).padStart(2, '0');

function heatmapClass(minutes) {
  if (!minutes) return '';
  if (minutes < 15) return 'q1';
  if (minutes < 30) return 'q2';
  if (minutes < 60) return 'q3';
  return 'q4';
}

async function loadProfile() {
  const data = await api('/api/profile');
  const { user, stats, achievements, heatmapDays } = data;

  const grid = document.getElementById('profile-stats');
  grid.innerHTML = '';
  const cards = [
    ['Total focus', Math.floor(stats.totalMinutes / 60) + 'h ' + (stats.totalMinutes % 60) + 'm'],
    ['Sessions', stats.totalSessions],
    ['Tasks completed', stats.tasksCompleted],
    ['Day streak', stats.streak],
  ];
  cards.forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    const l = document.createElement('p');
    l.className = 'stat-label';
    l.textContent = label;
    const v = document.createElement('p');
    v.className = 'stat-value';
    v.textContent = value;
    card.appendChild(l);
    card.appendChild(v);
    grid.appendChild(card);
  });

  const achGrid = document.getElementById('achievement-grid');
  achGrid.innerHTML = '';
  achievements.forEach((a) => {
    const el = document.createElement('div');
    el.className = 'achievement' + (a.unlocked ? ' unlocked' : '');
    el.innerHTML = '<p class="achievement-name"></p><p class="achievement-desc"></p>';
    el.querySelector('.achievement-name').textContent = (a.unlocked ? '★ ' : '☆ ') + a.name;
    el.querySelector('.achievement-desc').textContent = a.description;
    achGrid.appendChild(el);
  });

  const minutesByDate = new Map(heatmapDays.map((d) => [d.date, d.minutes]));
  const heat = document.getElementById('heatmap');
  heat.innerHTML = '';
  const end = new Date();
  const cursor = new Date(end);
  cursor.setDate(cursor.getDate() - 181);
  while (cursor.getDay() !== 0) cursor.setDate(cursor.getDate() - 1);
  while (cursor <= end) {
    const key = dateKeyOf(cursor);
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell ' + heatmapClass(minutesByDate.get(key) || 0);
    cell.title = key + ': ' + (minutesByDate.get(key) || 0) + ' min';
    heat.appendChild(cell);
    cursor.setDate(cursor.getDate() + 1);
  }

  document.getElementById('account-name').value = user.fullName;
  document.getElementById('account-email').value = user.email;
}

document.getElementById('account-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const hint = document.getElementById('account-hint');
  hint.textContent = '\u00A0';
  hint.className = 'hint';
  try {
    const data = await api('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({
        fullName: document.getElementById('account-name').value.trim(),
        email: document.getElementById('account-email').value.trim(),
      }),
    });
    currentUser = data.user;
    document.getElementById('nav-name').textContent = currentUser.fullName;
    hint.textContent = 'Account updated.';
    hint.className = 'hint ok';
  } catch (err) {
    hint.textContent = err.message;
    hint.className = 'hint error';
  }
});

document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const hint = document.getElementById('password-hint');
  hint.textContent = '\u00A0';
  hint.className = 'hint';
  try {
    await api('/api/profile/password', {
      method: 'PUT',
      body: JSON.stringify({
        currentPassword: document.getElementById('current-password').value,
        newPassword: document.getElementById('new-password').value,
      }),
    });
    e.target.reset();
    hint.textContent = 'Password changed.';
    hint.className = 'hint ok';
  } catch (err) {
    hint.textContent = err.message;
    hint.className = 'hint error';
  }
});

/* ---------- logout & boot ---------- */

async function logout() {
  if (timer.state !== 'idle') {
    stopTicking();
    timer.state = 'idle';
    await saveTimerState('Stopped');
  }
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = 'index.html';
}

document.getElementById('logout-btn').addEventListener('click', logout);

const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
  const THEME_ICON = { light: '☀', dark: '☾' };
  const THEME_LABEL = { light: 'Light theme', dark: 'Dark theme' };
  function syncThemeIcon() {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const target = current === 'dark' ? 'light' : 'dark';
    const icon = themeToggle.querySelector('.theme-icon') || themeToggle;
    icon.textContent = THEME_ICON[target];
    const label = themeToggle.querySelector('.theme-label');
    if (label) label.textContent = THEME_LABEL[target];
    themeToggle.setAttribute('aria-label', 'Switch to ' + target + ' theme');
  }
  syncThemeIcon();
  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('fg-theme', next);
    syncThemeIcon();
  });
}

let refreshInFlight = false;

async function refreshData() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    await Promise.all([loadOverview(), loadIntention(), loadTasks(), loadHistory(), loadAnalytics(), loadJournal(), loadProfile()]);
  } finally {
    refreshInFlight = false;
  }
}

const REFRESH_INTERVAL_MS = 10000;
setInterval(() => {
  if (!document.hidden) refreshData();
}, REFRESH_INTERVAL_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshData();
});
window.addEventListener('focus', refreshData);

async function init() {
  try {
    const me = await api('/api/auth/me');
    currentUser = me.user;
  } catch (err) {
    return;
  }
  await Promise.all([loadOverview(), loadIntention(), loadTasks(), loadHistory(), loadAnalytics(), loadJournal(), loadProfile()]);
}

init();
