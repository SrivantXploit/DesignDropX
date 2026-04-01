// ========== ONBOARDING WIZARD LOGIC ==========
// Handles step navigation, localStorage writes, and chip autofill.
// Does NOT touch Supabase, auth, or any builder logic.

(function() {
  const steps = [
    document.getElementById('step-1'),
    document.getElementById('step-2'),
    document.getElementById('step-3')
  ];

  let currentStep = 0;

  function showStep(index) {
    steps.forEach((s, i) => {
      s.classList.remove('active');
      if (i === index) {
        // Small delay to retrigger animation
        requestAnimationFrame(() => s.classList.add('active'));
      }
    });
    currentStep = index;
  }

  // --- STEP 1: Option cards ---
  document.querySelectorAll('.ob-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const choice = opt.dataset.choice;
      localStorage.setItem('project_type', choice);
      showStep(1);
      // Focus the name input
      setTimeout(() => {
        const nameInput = document.getElementById('project-name');
        if (nameInput) nameInput.focus();
      }, 350);
    });
  });

  // --- STEP 2: Name your project ---
  const nameInput = document.getElementById('project-name');
  const createBtn = document.getElementById('btn-create');

  nameInput.addEventListener('input', () => {
    const val = nameInput.value.trim();
    createBtn.disabled = val.length === 0;
  });

  // Allow Enter key to submit
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && nameInput.value.trim().length > 0) {
      createBtn.click();
    }
  });

  createBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) return;
    localStorage.setItem('project_name', name);
    showStep(2);
  });

  // Back button: Step 2 → Step 1
  document.getElementById('back-to-1').addEventListener('click', () => showStep(0));

  // --- STEP 3: Describe your site ---
  const descTextarea = document.getElementById('project-desc');
  const descCount = document.getElementById('desc-count');
  const continueBtn = document.getElementById('btn-continue');
  const skipBtn = document.getElementById('btn-skip');

  descTextarea.addEventListener('input', () => {
    descCount.textContent = descTextarea.value.length;
    // Deselect chips when user manually types
    document.querySelectorAll('.ob-chip').forEach(c => c.classList.remove('selected'));
  });

  // Chip autofill
  document.querySelectorAll('.ob-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const desc = chip.dataset.desc;
      descTextarea.value = desc;
      descCount.textContent = desc.length;
      // Toggle chip selection visual
      document.querySelectorAll('.ob-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
  });

  // Continue → save description and go to builder
  continueBtn.addEventListener('click', () => {
    const desc = descTextarea.value.trim();
    if (desc) {
      localStorage.setItem('project_description', desc);
    }
    window.location.href = 'builder.html';
  });

  // Skip → go to builder without saving description
  skipBtn.addEventListener('click', () => {
    window.location.href = 'builder.html';
  });

  // Back button: Step 3 → Step 2
  document.getElementById('back-to-2').addEventListener('click', () => showStep(1));
})();
