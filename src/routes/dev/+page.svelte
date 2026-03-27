<script>
    // Dev hub — switch between Dev tools, Admin view, Student view
</script>

<div class="max-w-2xl">
    <h1 class="text-2xl font-bold text-gray-800 mb-2">Dev Hub</h1>
    <p class="text-gray-500 text-sm mb-8">Jump into any role view without switching accounts.</p>

    <div class="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <!-- Dev Tools -->
        <div class="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
                <h2 class="font-semibold text-gray-800">Dev Tools</h2>
            </div>
            <a href="/dev/preview" class="text-sm text-indigo-600 hover:underline">Question Preview</a>
            <a href="/dev/algo-check" class="text-sm text-indigo-600 hover:underline">Algo Check</a>
        </div>

        <!-- Admin View -->
        <div class="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2 h-2 rounded-full bg-gray-700"></span>
                <h2 class="font-semibold text-gray-800">Admin View</h2>
            </div>
            <a href="/admin" class="text-sm text-indigo-600 hover:underline">All Classes</a>
            <a href="/admin/teachers" class="text-sm text-indigo-600 hover:underline">Teachers</a>
            <a href="/admin/classes" class="text-sm text-indigo-600 hover:underline">Manage Classes</a>
        </div>

        <!-- Student View -->
        <div class="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2 h-2 rounded-full bg-green-500"></span>
                <h2 class="font-semibold text-gray-800">Student View</h2>
            </div>
            <a href="/student" class="text-sm text-indigo-600 hover:underline">Question Loop</a>
        </div>
    </div>

    <p class="text-xs text-gray-400 mt-8">
        Teacher views are accessible from Admin → any class → "View as Teacher".
    </p>
</div>
