# Server-only content

Never import these files from `app/`: they would be compiled into the public client bundle.
Donor contacts reach a device only through the authorized `/api/v1/donors/directory` response, and only for coordinators.
