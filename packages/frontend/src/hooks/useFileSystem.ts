import { useCallback } from 'react';
import { message } from 'antd';
import { useProjectStore } from '@/store/projectStore';
import type { ProjectFile } from '@/types/schema';

const FILE_EXT = '.dbdesign.json';
const MIME_TYPE = 'application/json';

/**
 * 将当前项目保存为 JSON 文件（触发浏览器下载）
 */
export function useSaveProject() {
  const { project, markSaved } = useProjectStore();

  return useCallback(() => {
    if (!project) {
      message.warning('没有可保存的项目');
      return;
    }
    const updated: ProjectFile = { ...project, updatedAt: new Date().toISOString() };
    const json = JSON.stringify(updated, null, 2);
    const blob = new Blob([json], { type: MIME_TYPE });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}${FILE_EXT}`;
    a.click();
    URL.revokeObjectURL(url);
    markSaved();
    message.success('项目已保存');
  }, [project, markSaved]);
}

/**
 * 从本地文件加载项目（打开 .dbdesign.json）
 */
export function useLoadProject() {
  const { loadProject } = useProjectStore();

  return useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = FILE_EXT + ',' + MIME_TYPE;
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed: ProjectFile = JSON.parse(text);
        if (parsed.version !== '1.0') {
          message.error('不支持的项目文件版本');
          return;
        }
        loadProject(parsed);
        message.success(`项目「${parsed.name}」已加载`);
      } catch {
        message.error('文件解析失败，请检查文件格式');
      }
    };
    input.click();
  }, [loadProject]);
}
