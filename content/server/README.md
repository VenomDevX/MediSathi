# Server-only content

Never import these files from `app/`: they would be compiled into the public client bundle.
Donor contacts reach a device only through the authorized `/api/v1/donors/directory` response, and only for coordinators.

Demo numbers are `+91 00000 000NN`: Indian mobile numbers start with 6 to 9, so these can never reach a real person.
