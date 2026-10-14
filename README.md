# Find public Gmail addresses on GitLab

This local app filters public GitLab user profiles by location, listed job title, and an inferred experience level. It displays an address only when GitLab returns it as `public_email` and it ends in `@gmail.com`. The app never reads or guesses private or commit email addresses.

## Run locally

1. Install Node.js 18 or later.
2. Create a GitLab personal access token with the `read_api` scope.
3. Start the app:

   ```powershell
   npm start
   ```

4. Open <http://localhost:3000>, paste the token, enter a location, and search.

The token stays in page memory and is sent to the local server for each search. It is not saved to browser storage or disk. Do not hard-code it into `index.html`. To use a self-managed GitLab instance, set `GITLAB_URL` before starting the server.

## Search limits

GitLab does not provide a user-search endpoint with location or job-title filters. To avoid searching by name or username, the app requests one page of 100 active human profiles and filters their individual public profile fields locally. Only the first page is checked, so results are incomplete. GitLab may omit profile fields or deny access to individual profiles.

Seniority is estimated from the listed job title because GitLab does not provide a structured experience-level field. It is not verified. Job title and location filters only match information users have added to their profiles.
