import { writable } from 'svelte/store';

export const session = writable({
    user: null,
    loading: true,
    loggedIn: false,
    role: null
});