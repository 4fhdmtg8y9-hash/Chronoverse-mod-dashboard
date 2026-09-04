CREATE TABLE IF NOT EXISTS moderators (
    id SERIAL PRIMARY KEY,
    discord_id VARCHAR(30) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mod_actions (
    id SERIAL PRIMARY KEY,
    moderator_id INTEGER REFERENCES moderators(id) ON DELETE CASCADE,
    action_type VARCHAR(30) NOT NULL,
    target_discord_id VARCHAR(30),
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requests (
    id SERIAL PRIMARY KEY,
    type VARCHAR(30) NOT NULL,
    discord_user_id VARCHAR(30) NOT NULL,
    username VARCHAR(100),
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by VARCHAR(30),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inactivity_notices (
    id SERIAL PRIMARY KEY,
    discord_user_id VARCHAR(30) NOT NULL,
    username VARCHAR(100),
    reason TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by VARCHAR(30),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
