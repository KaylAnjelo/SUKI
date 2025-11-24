async function deleteUser(event, form) {
  event.preventDefault();
  const userId = form.getAttribute('data-user-id');
  if (!userId) return alert('User id not found');
  if (!confirm('Are you sure you want to delete this user?')) return false;

  try {
    const res = await fetch(`/users/user/delete/${userId}`, { method: 'POST', headers: { 'Accept': 'application/json' } });
    const data = await res.json();
    if (data.success) {
      form.closest('tr').remove();
    } else {
      alert('Failed to delete user: ' + (data.message || 'Unknown'));
    }
  } catch (err) {
    alert('Error deleting user');
  }
  return false;
}

let editModal = null;

function createEditModal() {
  if (editModal) return editModal;
  editModal = document.createElement('div');
  editModal.className = 'modal';
  editModal.id = 'editUserModal';
  editModal.innerHTML = `
    <div class="modal-content modal-animate">
      <div class="modal-header">
        <h2>Edit User</h2>
        <span class="close" id="editClose">&times;</span>
      </div>
      <form id="editUserForm">
        <div class="modal-body">
          <div class="form-row"><label>Username</label><input name="username" id="edit_username" required></div>
          <div class="form-row"><label>First name</label><input name="first_name" id="edit_first_name"></div>
          <div class="form-row"><label>Last name</label><input name="last_name" id="edit_last_name"></div>
          <div class="form-row"><label>Email</label><input name="user_email" id="edit_user_email" type="email" required></div>
          <div class="form-row"><label>Contact</label><input name="contact_number" id="edit_contact_number"></div>
          <div class="form-row"><label>Store (optional)</label><select name="store_id" id="edit_store_id"><option value="">-- None --</option></select></div>
          <div class="form-row"><label>Password (leave blank to keep)</label><input name="password" id="edit_password" type="password"></div>
        </div>
        <div class="modal-footer" style="text-align:right; padding:10px;">
          <button type="button" id="editCancel">Cancel</button>
          <button type="submit">Save changes</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(editModal);

  document.getElementById('editClose').addEventListener('click', closeEditModal);
  document.getElementById('editCancel').addEventListener('click', closeEditModal);
  document.getElementById('editUserForm').addEventListener('submit', onEditSubmit);

  return editModal;
}

function closeEditModal() {
  const m = document.getElementById('editUserModal');
  if (m) m.style.display = 'none';
}

async function showEditUserModal(userId) {
  createEditModal();
  const modal = document.getElementById('editUserModal');
  modal.style.display = 'block';

  try {
    const res = await fetch(`/users/user/${userId}`);
    const data = await res.json();
    if (!data.success) {
      alert('Failed to load user');
      return;
    }
    const user = data.user;
    document.getElementById('edit_username').value = user.username || '';
    document.getElementById('edit_first_name').value = user.first_name || '';
    document.getElementById('edit_last_name').value = user.last_name || '';
    document.getElementById('edit_user_email').value = user.user_email || '';
    document.getElementById('edit_contact_number').value = user.contact_number || '';
    document.getElementById('edit_password').value = '';

    // Populate store dropdown if available
    const storeSelect = document.getElementById('edit_store_id');
    storeSelect.innerHTML = '<option value="">-- None --</option>';
    if (window.__SUKI_STORES && Array.isArray(window.__SUKI_STORES)) {
      window.__SUKI_STORES.forEach(s => {
        const o = document.createElement('option');
        o.value = s.store_id;
        o.textContent = s.store_name;
        if (s.store_id === user.store_id) o.selected = true;
        storeSelect.appendChild(o);
      });
    }

    // attach user id to form dataset
    document.getElementById('editUserForm').dataset.userId = userId;
  } catch (err) {
    alert('Error loading user');
  }
}

async function onEditSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const userId = form.dataset.userId;
  if (!userId) return alert('User id missing');

  const payload = {
    username: document.getElementById('edit_username').value,
    first_name: document.getElementById('edit_first_name').value,
    last_name: document.getElementById('edit_last_name').value,
    user_email: document.getElementById('edit_user_email').value,
    contact_number: document.getElementById('edit_contact_number').value,
    store_id: document.getElementById('edit_store_id').value,
    password: document.getElementById('edit_password').value
  };

  try {
    const res = await fetch(`/users/user/update/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert('User updated');
      closeEditModal();
      window.location.reload();
    } else {
      alert('Failed to update user: ' + (data.message || 'Unknown'));
    }
  } catch (err) {
    alert('Error updating user');
  }
}

// Expose for inline onclick handlers
window.deleteUser = deleteUser;
window.showEditUserModal = showEditUserModal;
window.closeEditModal = closeEditModal;

// Helper to initialize stores array exposed to client when template renders
window.__SUKI_STORES = window.__SUKI_STORES || [];
