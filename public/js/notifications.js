document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('notificationsBtn');
  const dropdown = document.getElementById('notificationsDropdown');
  const list = document.getElementById('notificationsList');

  if (!btn || !dropdown || !list) {
    console.warn('Notification elements not found in the DOM.');
    return;
  }

  btn.addEventListener('click', async (e) => {
    e.stopPropagation(); // Prevent click from bubbling to document

    // Toggle visibility
    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
      try {
        const response = await fetch('/notifications');
        if (!response.ok) throw new Error('Network response was not ok');

        const logs = await response.json();
        list.innerHTML = ''; // Clear previous

        if (logs.length === 0) {
          const li = document.createElement('li');
          li.textContent = 'No recent logins.';
          list.appendChild(li);
        } else {
          logs.forEach(log => {
            const li = document.createElement('li');
            const time = new Date(log.login_time).toLocaleString();
            li.textContent = `${log.admin_name} logged in at ${time}`;
            list.appendChild(li);
          });
        }

      } catch (err) {
        console.error('❌ Failed to fetch notifications:', err);
        dropdown.style.display = 'none';
      }
    }
  });

  // Hide dropdown if clicking outside
  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
});
