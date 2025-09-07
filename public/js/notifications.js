document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('notificationsBtn');
  const dropdown = document.getElementById('notificationsDropdown');
  const list = document.getElementById('notificationsList');

  if (!btn || !dropdown || !list) {
    console.warn('Notification elements not found in the DOM.');
    return;
  }

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();

    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
      try {
        const response = await fetch('/notifications');
        if (!response.ok) throw new Error('Network response was not ok');

        const logs = await response.json();
        list.innerHTML = '';

        if (logs.length === 0) {
          const li = document.createElement('li');
          li.textContent = 'No recent logins.';
          list.appendChild(li);
        } else {
          logs.forEach(log => {
            if (!log.login_time) {
              console.error('Invalid date: null or missing login_time');
              return; // Skip this log entry if the date is invalid or missing
            }

            // Log the raw login_time for debugging
            console.log(log.login_time);

            // Create a Date object from the timestamp (which should be in UTC)
            const loginDate = new Date(log.login_time); // This converts from UTC to local time

            // Check if the date is valid
            if (isNaN(loginDate)) {
              console.error('Invalid date:', log.login_time);
              return;  // Skip this log entry if the date is invalid
            }

            const utcPlus8 = new Date(loginDate.getTime() + 8 * 60 * 60 * 1000);
            // 12 hour format for the notifications
            const hours = utcPlus8.getHours();
            const hours12 = (hours % 12) || 12; // convert 0 to 12
            const minutes = String(utcPlus8.getMinutes()).padStart(2, '0');
            const seconds = String(utcPlus8.getSeconds()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';

            const formattedDate = `${utcPlus8.getFullYear()}-${String(utcPlus8.getMonth() + 1).padStart(2, '0')}-${String(utcPlus8.getDate()).padStart(2, '0')} ` +`${hours12}:${minutes}:${seconds} ${ampm}`;
            const li = document.createElement('li');
            li.textContent = `${log.admin_name} logged in on ${formattedDate}`;
            list.appendChild(li);
          });
        }

      } catch (err) {
        console.error('❌ Failed to fetch notifications:', err);
        dropdown.style.display = 'none';
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
});
