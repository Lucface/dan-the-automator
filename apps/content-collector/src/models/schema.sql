-- Content Collector Database Schema
-- PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table (destinations for content)
CREATE TABLE projects (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    keywords TEXT[], -- Keywords for auto-routing
    intake_path VARCHAR(500), -- File path for project content
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Categories table (can be auto-created by AI)
CREATE TABLE categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_id VARCHAR(50) REFERENCES categories(id),
    auto_detect_keywords TEXT[], -- Keywords that trigger this category
    is_auto_created BOOLEAN DEFAULT false,
    item_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Main content items table
CREATE TABLE content_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Source information
    source VARCHAR(50) NOT NULL, -- 'api', 'email', 'shortcut', 'slack', 'browser'
    source_device VARCHAR(100),
    source_metadata JSONB DEFAULT '{}',

    -- Content
    content_type VARCHAR(50) NOT NULL, -- 'link', 'text', 'image', 'video', 'file', 'mixed'
    raw_content TEXT NOT NULL,
    parsed_content JSONB DEFAULT '{}',
    -- {
    --   url?: string,
    --   title?: string,
    --   description?: string,
    --   image_url?: string,
    --   text?: string,
    --   file_path?: string
    -- }

    -- User provided context
    user_context TEXT,

    -- AI analysis results
    ai_analysis JSONB DEFAULT '{}',
    -- {
    --   summary: string,
    --   detected_type: string,
    --   suggested_project?: string,
    --   suggested_category?: string,
    --   suggested_tags: string[],
    --   confidence: number (0-1),
    --   reasoning: string
    -- }

    -- Classification (may be set by AI or user)
    project_id VARCHAR(50) REFERENCES projects(id),
    category_id VARCHAR(50) REFERENCES categories(id),
    tags TEXT[] DEFAULT '{}',

    -- Status
    status VARCHAR(50) DEFAULT 'inbox', -- 'inbox', 'processing', 'categorized', 'routed', 'archived'
    priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'

    -- File storage reference
    file_path VARCHAR(500),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    archived_at TIMESTAMP WITH TIME ZONE
);

-- Tags table for normalized tag storage
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Content-Tags junction table
CREATE TABLE content_tags (
    content_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (content_id, tag_id)
);

-- Processing queue table
CREATE TABLE processing_queue (
    id SERIAL PRIMARY KEY,
    content_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- AI decisions log (for learning and debugging)
CREATE TABLE ai_decisions (
    id SERIAL PRIMARY KEY,
    content_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
    decision_type VARCHAR(50), -- 'categorize', 'route', 'tag', 'create_category'
    input_data JSONB,
    output_data JSONB,
    confidence DECIMAL(3,2),
    model_used VARCHAR(100),
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tidy jobs log
CREATE TABLE tidy_jobs (
    id SERIAL PRIMARY KEY,
    job_type VARCHAR(50), -- 'daily', 'weekly', 'monthly', 'manual'
    status VARCHAR(50) DEFAULT 'pending',
    items_processed INTEGER DEFAULT 0,
    items_categorized INTEGER DEFAULT 0,
    items_archived INTEGER DEFAULT 0,
    categories_created INTEGER DEFAULT 0,
    categories_merged INTEGER DEFAULT 0,
    summary JSONB,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_content_items_status ON content_items(status);
CREATE INDEX idx_content_items_project ON content_items(project_id);
CREATE INDEX idx_content_items_category ON content_items(category_id);
CREATE INDEX idx_content_items_created_at ON content_items(created_at DESC);
CREATE INDEX idx_content_items_content_type ON content_items(content_type);
CREATE INDEX idx_content_items_tags ON content_items USING GIN(tags);
CREATE INDEX idx_processing_queue_status ON processing_queue(status);

-- Full text search index on content
CREATE INDEX idx_content_items_fts ON content_items
    USING GIN(to_tsvector('english', COALESCE(raw_content, '') || ' ' || COALESCE(user_context, '')));

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_content_items_updated_at
    BEFORE UPDATE ON content_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default categories
INSERT INTO categories (id, name, description, auto_detect_keywords) VALUES
    ('junk-drawer', 'Junk Drawer', 'Uncategorized items for later sorting', '{}'),
    ('code-snippets', 'Code Snippets', 'Useful code patterns and snippets', ARRAY['code', 'function', 'snippet', 'github.com', 'gist']),
    ('design-inspiration', 'Design Inspiration', 'UI/UX ideas and visual inspiration', ARRAY['design', 'ui', 'ux', 'dribbble', 'figma', 'behance']),
    ('tools-resources', 'Tools & Resources', 'Useful tools, libraries, and services', ARRAY['tool', 'library', 'api', 'service', 'app']),
    ('articles-reading', 'Articles & Reading', 'Articles, blog posts, documentation', ARRAY['article', 'blog', 'post', 'medium.com', 'dev.to']),
    ('business-ideas', 'Business Ideas', 'Business opportunities and ideas', ARRAY['business', 'startup', 'idea', 'opportunity', 'market']),
    ('learning', 'Learning', 'Educational content and tutorials', ARRAY['tutorial', 'course', 'learn', 'education', 'guide']),
    ('media', 'Media', 'Videos, podcasts, and multimedia content', ARRAY['video', 'youtube', 'podcast', 'audio', 'media']);

-- Insert sample projects (user will customize)
INSERT INTO projects (id, name, description, keywords, intake_path) VALUES
    ('twentyfive', 'TwentyFive CRM', 'CRM application with AI features',
     ARRAY['crm', '25', 'customer', 'sales', 'dashboard', 'client'],
     './content/projects/twentyfive'),
    ('youtube-channel', 'YouTube Channel', 'Video content and ideas',
     ARRAY['video', 'youtube', 'content', 'tutorial', 'channel'],
     './content/projects/youtube-channel'),
    ('dan-automator', 'Dan the Automator', 'Automation and AI agent system',
     ARRAY['automation', 'agent', 'ai', 'fix', 'bot', 'dan'],
     './content/projects/dan-automator');
