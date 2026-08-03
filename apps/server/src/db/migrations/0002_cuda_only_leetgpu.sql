-- cuda 分类只保留 leetgpu 编程题：其余 CUDA 题（seed 概念题、ai-infra-notes 专题/daily）归入 knowledge
UPDATE `questions` SET `category` = 'knowledge' WHERE `category` = 'cuda' AND `source_key` NOT LIKE 'leetgpu:%';
