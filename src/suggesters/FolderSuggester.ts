import { AbstractInputSuggest, TAbstractFile, TFolder } from "obsidian";
import { Iadapter } from "src/dataStore/adapter";

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
    private readonly inputEl: HTMLInputElement;

    constructor(inputEl: HTMLInputElement) {
        super(Iadapter.instance.app, inputEl);
        this.inputEl = inputEl;
    }

    getSuggestions(inputStr: string): TFolder[] {
        const abstractFiles = Iadapter.instance.vault.getAllLoadedFiles();
        const folders: TFolder[] = [];
        const lowerCaseInputStr = inputStr.toLowerCase();

        abstractFiles.forEach((folder: TAbstractFile) => {
            if (
                folder instanceof TFolder &&
                folder.path.toLowerCase().includes(lowerCaseInputStr)
            ) {
                folders.push(folder);
            }
        });

        return folders;
    }

    renderSuggestion(file: TFolder, el: HTMLElement): void {
        el.setText(file.path);
    }

    selectSuggestion(file: TFolder): void {
        this.setValue(file.path);
        this.inputEl.value = file.path;
        this.inputEl.trigger("input");
        this.close();
    }
}
