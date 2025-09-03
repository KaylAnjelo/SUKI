// Select the modal
const addStoreModal = document.getElementById('addStoreModal');

// Show the modal
function showAddStoreForm() {
    addStoreModal.style.display = 'block';
}

// Close the modal
function closeModal() {
    addStoreModal.style.display = 'none';
}

// Close modal when clicking outside of it
window.onclick = function(event) {
    if (event.target === addStoreModal) {
        closeModal();
    }
}

// Confirm deletion (optional)
function confirmDelete(form) {
    return confirm('Are you sure you want to delete this store? This action cannot be undone.');
}

// Handle form submission
document.addEventListener("DOMContentLoaded", () => {
    const addStoreForm = addStoreModal.querySelector('form');

    if (addStoreForm) {
        addStoreForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const formData = new FormData(addStoreForm);

            try {
                const response = await fetch(addStoreForm.action, {
                    method: addStoreForm.method,
                    body: formData
                });

                if (response.ok) {
                    alert('Store added successfully!');
                    closeModal();
                    window.location.reload();
                } else {
                    alert('Failed to add store.');
                }
            } catch (error) {
                console.error('Error submitting store:', error);
                alert('An error occurred while adding the store.');
            }
        });
    }
});
