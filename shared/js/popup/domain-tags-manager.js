/**
 * Manages domain tags input and display
 */

/**
 * Initialize domain tags input functionality
 * @param {HTMLElement} domainInput - The domain input field
 * @param {HTMLElement} domainTags - The container for domain tags
 * @param {Function} saveDraftFn - Function to save draft state
 * @returns {Object} - Methods to interact with domain tags
 */
export function initializeDomainTagsInput(domainInput, domainTags, saveDraftFn) {
    let domains = [];
    let batchMode = false;
    let saveTimeout = null;
    const SAVE_DELAY = 500; // Delay in milliseconds

    /**
     * Triggers save draft with debouncing to prevent excessive storage operations
     */
    function debouncedSaveDraft() {
        // Don't trigger saves during batch operations
        if (batchMode) return;

        // Clear any pending save
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }

        // Schedule a new save
        saveTimeout = setTimeout(() => {
            if (saveDraftFn) saveDraftFn();
        }, SAVE_DELAY);
    }

    /**
     * Renders all domain tags
     */
    function renderDomainTags() {
        domainTags.innerHTML = '';

        domains.forEach((domain, index) => {
            const tag = document.createElement('div');
            tag.classList.add('domainTag');

            const tagText = document.createElement('span');
            tagText.classList.add('domainTagText');
            tagText.textContent = domain;
            tag.appendChild(tagText);

            const removeBtn = document.createElement('button');
            removeBtn.classList.add('removeTagBtn');
            removeBtn.innerHTML = '&times;';
            removeBtn.title = 'Remove domain';
            removeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                removeDomain(index);
            });
            tag.appendChild(removeBtn);

            domainTags.appendChild(tag);
        });
    }

    /**
     * Adds a new domain tag
     * @param {string} domain - Domain to add
     */
    function addDomain(domain) {
        domain = domain.trim();
        if (!domain) return;

        // Don't add duplicates
        if (domains.includes(domain)) return;

        domains.push(domain);
        renderDomainTags();

        debouncedSaveDraft();
    }

    /**
     * Removes a domain tag by index
     * @param {number} index - Index of domain to remove
     */
    function removeDomain(index) {
        domains = domains.filter((_, i) => i !== index);
        renderDomainTags();

        debouncedSaveDraft();
    }

    /**
     * Sets the domains from an array
     * @param {Array} domainsArray - Array of domains to set
     */
    function setDomains(domainsArray) {
        // Enable batch mode to prevent multiple saves
        batchMode = true;

        if (Array.isArray(domainsArray)) {
            domains = [...domainsArray];
            renderDomainTags();
        }

        // Disable batch mode and trigger a single save
        batchMode = false;
        if (saveDraftFn) saveDraftFn();
    }

    /**
     * Gets the current domains array
     * @returns {Array} - Current domains
     */
    function getDomains() {
        return [...domains];
    }

    /**
     * Process input for multiple domains
     * @param {Event} e - Input event
     */
    function handleDomainInput(e) {
        // Handle comma or Enter key
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();

            // Get input value and add the domain
            const value = domainInput.value.replace(/,/g, '').trim();
            if (value) {
                addDomain(value);
                domainInput.value = '';
            }
        }
        // Handle backspace on empty input to remove last tag
        else if (e.key === 'Backspace' && domainInput.value === '' && domains.length > 0) {
            removeDomain(domains.length - 1);
        }
    }

    /**
     * Handle paste events with possible multiple domains
     * @param {Event} e - Paste event
     */
    function handlePaste(e) {
        e.preventDefault();
        const pastedText = (e.clipboardData || window.clipboardData).getData('text');

        // Enable batch mode to prevent multiple saves
        batchMode = true;

        // Split by commas, newlines, or spaces
        const values = pastedText.split(/[,\s\n]+/);

        values.forEach(value => {
            const trimmed = value.trim();
            if (trimmed) addDomain(trimmed);
        });

        // Disable batch mode and trigger a single save
        batchMode = false;
        debouncedSaveDraft();
    }

    /**
     * Handle blur event to add current input as tag
     */
    function handleBlur() {
        const value = domainInput.value.trim();
        if (value) {
            addDomain(value);
            domainInput.value = '';
        }
    }

    // Set up event listeners
    domainInput.addEventListener('keydown', handleDomainInput);
    domainInput.addEventListener('paste', handlePaste);
    domainInput.addEventListener('blur', handleBlur);

    // Return public methods
    return {
        addDomain,
        removeDomain,
        setDomains,
        getDomains,
        renderDomainTags
    };
}