import {
    buildExtractReviewContext,
    replaceExtractReviewContext,
} from "src/util/irExtractContext";
import { parseIrExtracts } from "src/util/irExtractParser";

describe("irExtractContext", () => {
    test("builds previous current and next blank-block context", () => {
        const source = "intro\nline\n\nbefore {{ir::target}}\nmore\n\nafter\nline\n\nend";
        const match = parseIrExtracts(source)[0];

        const context = buildExtractReviewContext(source, match);

        expect(context.sourceFrom).toBe(0);
        expect(context.sourceTo).toBe(
            "intro\nline\n\nbefore {{ir::target}}\nmore\n\nafter\nline".length,
        );
        expect(context.markdown).toBe("intro\nline\n\nbefore {{ir::target}}\nmore\n\nafter\nline");
        expect(context.currentOuterFrom).toBe("intro\nline\n\nbefore ".length);
        expect(context.currentOuterTo).toBe("intro\nline\n\nbefore {{ir::target}}".length);
    });

    test("uses available blocks when extract is in the first block", () => {
        const source = "{{ir::target}}\nline\n\nnext\n\nthird";
        const match = parseIrExtracts(source)[0];

        const context = buildExtractReviewContext(source, match);

        expect(context.markdown).toBe("{{ir::target}}\nline\n\nnext");
        expect(context.sourceFrom).toBe(0);
    });

    test("uses available blocks when extract is in the last block", () => {
        const source = "first\n\nprevious\n\nlast {{ir::target}}";
        const match = parseIrExtracts(source)[0];

        const context = buildExtractReviewContext(source, match);

        expect(context.markdown).toBe("previous\n\nlast {{ir::target}}");
        expect(context.sourceTo).toBe(source.length);
    });

    test("replaces only the selected context range in source text", () => {
        const source = "first\n\nbefore {{ir::target}}\n\nafter\n\nlast";
        const match = parseIrExtracts(source)[0];
        const context = buildExtractReviewContext(source, match);

        const nextSource = replaceExtractReviewContext(
            source,
            context,
            "first edited\n\nbefore {{ir::changed}}\n\nafter edited",
        );

        expect(nextSource).toBe("first edited\n\nbefore {{ir::changed}}\n\nafter edited\n\nlast");
    });
});
