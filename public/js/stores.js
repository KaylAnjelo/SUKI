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

// Confirm deletion and handle it properly
function confirmDelete(form) {
    if (confirm('Are you sure you want to delete this store? This action cannot be undone.')) {
        // Handle delete with fetch instead of form submission
        const storeId = form.action.split('/').pop();
        deleteStore(storeId);
        return false; // Prevent form submission
    }
    return false;
}

// Delete store function
async function deleteStore(storeId) {
    try {
        console.log('🗑️ Deleting store with ID:', storeId);
        
        const response = await fetch(`/users/stores/delete/${storeId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('Delete response status:', response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log('Delete success:', result);
            alert('Store deleted successfully!');
            window.location.reload();
        } else {
            const errorData = await response.json();
            console.error('Delete error:', errorData);
            alert(`Failed to delete store: ${errorData.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error deleting store:', error);
        alert('An error occurred while deleting the store: ' + error.message);
    }
}

// Handle form submission
document.addEventListener("DOMContentLoaded", () => {
    const addStoreForm = addStoreModal.querySelector('form');

    if (addStoreForm) {
        addStoreForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const formData = new FormData(addStoreForm);
            
            // Log form data for debugging
            console.log('Form data being sent:');
            for (let [key, value] of formData.entries()) {
                console.log(key + ': ' + value);
            }

            // Show loading state
            const submitBtn = addStoreForm.querySelector('.submit-btn');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Adding...';
            submitBtn.disabled = true;

            try {
                const response = await fetch(addStoreForm.action, {
                    method: addStoreForm.method,
                    body: formData
                });

                console.log('Response status:', response.status);
                console.log('Response headers:', response.headers);

                if (response.ok) {
                    const result = await response.json();
                    console.log('Success response:', result);
                    
                    // Show success message
                    alert('Store added successfully!');
                    
                    // Close modal
                    closeModal();
                    
                    // Reset form
                    addStoreForm.reset();
                    
                    // Reload page to show new store
                    window.location.reload();
                } else {
                    const errorText = await response.text();
                    console.error('Error response:', errorText);
                    alert(`Failed to add store. Status: ${response.status}. Error: ${errorText}`);
                }
            } catch (error) {
                console.error('Error submitting store:', error);
                alert('An error occurred while adding the store: ' + error.message);
            } finally {
                // Reset button state
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }
});
