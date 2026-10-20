package questions

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"strconv"
	"strings"
)

type ImportRow struct {
	Row      int               `json:"row"`
	Question Question          `json:"question"`
	Errors   map[string]string `json:"errors,omitempty"`
	Warnings map[string]string `json:"warnings,omitempty"`
}

func ParseImportFile(filename string, content []byte) ([]ImportRow, error) {
	var records [][]string
	var err error
	switch strings.ToLower(filename[strings.LastIndex(filename, ".")+1:]) {
	case "csv":
		r := csv.NewReader(bytes.NewReader(content))
		r.FieldsPerRecord = -1
		r.LazyQuotes = true
		firstLine := strings.SplitN(string(content), "\n", 2)[0]
		if strings.Count(firstLine, ";") > strings.Count(firstLine, ",") {
			r.Comma = ';'
		}
		records, err = r.ReadAll()
	case "xlsx":
		records, err = readXLSX(content)
	default:
		return nil, fmt.Errorf("Format file harus .xlsx atau .csv")
	}
	if err != nil {
		return nil, fmt.Errorf("File tidak dapat dibaca: %w", err)
	}
	if len(records) < 2 {
		return nil, fmt.Errorf("File belum memiliki baris soal")
	}
	columns := map[string]int{}
	for i, name := range records[0] {
		columns[normalizeHeader(name)] = i
	}
	for _, required := range []string{"tipe", "pertanyaan"} {
		if _, ok := columns[required]; !ok {
			return nil, fmt.Errorf("Kolom wajib '%s' tidak ditemukan", required)
		}
	}
	get := func(record []string, key string) string {
		i, ok := columns[key]
		if !ok || i >= len(record) {
			return ""
		}
		return strings.TrimSpace(record[i])
	}
	out := []ImportRow{}
	for i, record := range records[1:] {
		if len(strings.TrimSpace(strings.Join(record, ""))) == 0 {
			continue
		}
		getRow := func(key string) string { return get(record, key) }
		q := Question{Type: importType(getRow("tipe")), Prompt: getRow("pertanyaan"), Subject: getRow("mata_pelajaran"), Topic: getRow("topik"), Difficulty: getRow("kesulitan"), CreatedBy: "Guru"}
		q.Difficulty = defaultString(q.Difficulty, "Sedang")
		q.Subject = defaultString(q.Subject, "")
		points := getRow("bobot")
		if points == "" {
			q.Points = 1
		} else if q.Points, err = strconv.ParseFloat(strings.ReplaceAll(points, ",", "."), 64); err != nil {
			q.Points = 0
		}
		tags := getRow("tag")
		for _, tag := range strings.Split(tags, ",") {
			if tag = strings.TrimSpace(tag); tag != "" {
				q.Tags = append(q.Tags, tag)
			}
		}
		data, dataErr := importQuestionData(q.Type, q.Prompt, getRow)
		if dataErr != nil {
			rowErrors := map[string]string{"jawaban": dataErr.Error()}
			out = append(out, ImportRow{Row: i + 2, Question: q, Errors: rowErrors})
			if len(out) > 500 {
				return nil, fmt.Errorf("Maksimal 500 soal per impor")
			}
			continue
		}
		q.Data, _ = json.Marshal(data)
		rowErrors := map[string]string{}
		if validationErr := Validate(q); validationErr != nil {
			if fields, ok := validationErr.(FieldErrors); ok {
				rowErrors = fields
			} else {
				rowErrors["row"] = validationErr.Error()
			}
		}
		if len(rowErrors) > 0 {
			out = append(out, ImportRow{Row: i + 2, Question: q, Errors: rowErrors})
		} else {
			out = append(out, ImportRow{Row: i + 2, Question: q})
		}
		if len(out) > 500 {
			return nil, fmt.Errorf("Maksimal 500 soal per impor")
		}
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("Tidak ada baris soal untuk diimpor")
	}
	return out, nil
}

func normalizeHeader(value string) string {
	s := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(value, "\ufeff")))
	s = strings.NewReplacer(" ", "_", "-", "_", "ä", "a").Replace(s)
	s = strings.NewReplacer("/", "_", "(", "", ")", "", ".", "").Replace(s)
	aliases := map[string]string{
		"type": "tipe", "question_type": "tipe", "tipe_soal": "tipe", "prompt": "pertanyaan", "question": "pertanyaan", "points": "bobot", "subject": "mata_pelajaran", "topic": "topik", "class": "kelas", "difficulty": "kesulitan", "tags": "tag",
		"pilihan_jawaban": "pilihan", "pilihan": "pilihan", "nomor_kunci_pilihan": "kunci_pilihan", "jawaban_benar": "kunci_pilihan", "pernyataan": "pernyataan", "kunci_pernyataan": "kunci_pernyataan", "jawaban_diterima": "jawaban_diterima", "kunci_bagian_isian": "kunci_isian", "rubrik_esai": "rubrik", "pasangan_menjodohkan": "pasangan", "item_urutan": "urutan", "gambar_pertanyaan_url": "gambar_pertanyaan", "gambar_pilihan_url": "gambar_pilihan",
	}
	if alias, ok := aliases[s]; ok {
		return alias
	}
	return s
}

// importQuestionData translates teacher-friendly spreadsheet columns into the
// structured question data used internally by the exam and grading flows.
func importType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "pilihan ganda", "pilihan_ganda", "single choice", "single-choice":
		return SingleChoice
	case "pilihan ganda kompleks", "pilihan_ganda_kompleks", "multiple choice", "multiple-select":
		return MultiSelect
	case "benar / salah", "benar/salah", "benar_salah", "benar salah", "true / false":
		return TrueFalse
	case "jawaban singkat", "jawaban_singkat":
		return ShortAnswer
	case "isian", "isi", "fill in the blank":
		return FillBlank
	case "esai", "uraian":
		return Essay
	case "menjodohkan", "matching":
		return Matching
	case "mengurutkan", "ordering":
		return Ordering
	default:
		return strings.TrimSpace(value)
	}
}

func importQuestionData(questionType, prompt string, get func(string) string) (map[string]any, error) {
	data := map[string]any{}
	lines := func(key string) []string { return nonEmptyLines(get(key)) }
	switch questionType {
	case SingleChoice, MultiSelect:
		choices := lines("pilihan")
		if len(choices) == 0 {
			return data, nil
		}
		keys := map[int]bool{}
		for _, value := range splitImportList(get("kunci_pilihan")) {
			index, err := strconv.Atoi(value)
			if err != nil {
				return nil, fmt.Errorf("Nomor kunci pilihan harus berupa angka, misalnya 1 atau 1,3")
			}
			if index < 1 || index > len(choices) {
				return nil, fmt.Errorf("Nomor kunci pilihan %d tidak ada pada daftar pilihan", index)
			}
			keys[index-1] = true
		}
		images := strings.Split(strings.ReplaceAll(get("gambar_pilihan"), "\r\n", "\n"), "\n")
		options := make([]map[string]any, 0, len(choices))
		for i, choice := range choices {
			option := map[string]any{"id": fmt.Sprintf("o%d", i+1), "text": choice, "correct": keys[i]}
			if i < len(images) && strings.TrimSpace(images[i]) != "" {
				option["media"] = map[string]string{"url": strings.TrimSpace(images[i])}
			}
			options = append(options, option)
		}
		data["options"] = options
	case TrueFalse:
		statements, keys := lines("pernyataan"), lines("kunci_pernyataan")
		items := make([]map[string]any, 0, len(statements))
		for i, statement := range statements {
			if i >= len(keys) {
				return nil, fmt.Errorf("Isi kunci Benar/Salah untuk pernyataan %d", i+1)
			}
			key := strings.ToLower(strings.TrimSpace(keys[i]))
			if key != "benar" && key != "salah" && key != "true" && key != "false" {
				return nil, fmt.Errorf("Kunci pernyataan %d harus Benar atau Salah", i+1)
			}
			items = append(items, map[string]any{"id": fmt.Sprintf("s%d", i+1), "text": statement, "correct": key == "benar" || key == "true"})
		}
		data["statements"] = items
	case ShortAnswer:
		data["accepted_answers"] = splitImportList(get("jawaban_diterima"))
	case FillBlank:
		blanks := []map[string]any{}
		answers := lines("kunci_isian")
		blankCount := strings.Count(prompt, "___")
		if blankCount > 0 && blankCount != len(answers) {
			return nil, fmt.Errorf("Jumlah kunci isian (%d) harus sama dengan jumlah tanda ___ di pertanyaan (%d)", len(answers), blankCount)
		}
		for i, answer := range answers {
			blanks = append(blanks, map[string]any{"id": fmt.Sprintf("b%d", i+1), "accepted_answers": splitImportList(answer)})
		}
		data["blanks"] = blanks
	case Essay:
		data["rubric"] = get("rubrik")
		data["manual_grading"] = true
	case Matching:
		pairs := []map[string]any{}
		for i, line := range lines("pasangan") {
			parts := strings.SplitN(line, "->", 2)
			if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
				return nil, fmt.Errorf("Pasangan %d harus ditulis: istilah -> pasangan", i+1)
			}
			pairs = append(pairs, map[string]any{"id": fmt.Sprintf("p%d", i+1), "left": strings.TrimSpace(parts[0]), "right": strings.TrimSpace(parts[1])})
		}
		data["pairs"] = pairs
	case Ordering:
		items := []map[string]any{}
		for i, item := range lines("urutan") {
			items = append(items, map[string]any{"id": fmt.Sprintf("i%d", i+1), "text": item})
		}
		data["items"] = items
	default:
		return data, nil
	}
	if imageURL := strings.TrimSpace(get("gambar_pertanyaan")); imageURL != "" {
		data["prompt_media"] = map[string]string{"url": imageURL}
	}
	return data, nil
}

func nonEmptyLines(value string) []string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	items := []string{}
	for _, line := range strings.Split(value, "\n") {
		if strings.TrimSpace(line) != "" {
			items = append(items, strings.TrimSpace(line))
		}
	}
	return items
}

func splitImportList(value string) []string {
	items := []string{}
	for _, item := range strings.FieldsFunc(value, func(r rune) bool { return r == '|' || r == ',' || r == '\n' || r == '\r' }) {
		if strings.TrimSpace(item) != "" {
			items = append(items, strings.TrimSpace(item))
		}
	}
	return items
}

func readXLSX(content []byte) ([][]string, error) {
	zr, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return nil, err
	}
	files := map[string]*zip.File{}
	for _, file := range zr.File {
		if file.UncompressedSize64 > 20<<20 {
			return nil, fmt.Errorf("Isi file Excel melebihi batas ukuran")
		}
		files[file.Name] = file
	}
	read := func(name string) ([]byte, error) {
		file, ok := files[name]
		if !ok {
			return nil, fmt.Errorf("sheet Excel tidak ditemukan")
		}
		rc, err := file.Open()
		if err != nil {
			return nil, err
		}
		defer rc.Close()
		return io.ReadAll(rc)
	}
	shared := []string{}
	if _, ok := files["xl/sharedStrings.xml"]; ok {
		b, err := read("xl/sharedStrings.xml")
		if err != nil {
			return nil, err
		}
		var s struct {
			Items []struct {
				Text string `xml:"t"`
				Runs []struct {
					Text string `xml:"t"`
				} `xml:"r"`
			} `xml:"si"`
		}
		if err = xml.Unmarshal(b, &s); err != nil {
			return nil, err
		}
		for _, item := range s.Items {
			if item.Text != "" {
				shared = append(shared, item.Text)
			} else {
				var text strings.Builder
				for _, run := range item.Runs {
					text.WriteString(run.Text)
				}
				shared = append(shared, text.String())
			}
		}
	}
	b, err := read("xl/worksheets/sheet1.xml")
	if err != nil {
		return nil, err
	}
	var sheet struct {
		Rows []struct {
			Cells []struct {
				Ref    string `xml:"r,attr"`
				Type   string `xml:"t,attr"`
				Value  string `xml:"v"`
				Inline struct {
					Text string `xml:"t"`
				} `xml:"is"`
			} `xml:"c"`
		} `xml:"sheetData>row"`
	}
	if err = xml.Unmarshal(b, &sheet); err != nil {
		return nil, err
	}
	records := make([][]string, len(sheet.Rows))
	for ri, row := range sheet.Rows {
		max := -1
		indexes := make([]int, len(row.Cells))
		for i, cell := range row.Cells {
			indexes[i] = columnIndex(cell.Ref)
			if indexes[i] > max {
				max = indexes[i]
			}
		}
		records[ri] = make([]string, max+1)
		for i, cell := range row.Cells {
			value := cell.Value
			if cell.Type == "s" {
				idx, parseErr := strconv.Atoi(value)
				if parseErr == nil && idx >= 0 && idx < len(shared) {
					value = shared[idx]
				}
			}
			if cell.Type == "inlineStr" {
				value = cell.Inline.Text
			}
			records[ri][indexes[i]] = value
		}
	}
	return records, nil
}

func columnIndex(ref string) int {
	n := 0
	for _, r := range ref {
		if r >= 'A' && r <= 'Z' {
			n = n*26 + int(r-'A'+1)
		} else if r >= 'a' && r <= 'z' {
			n = n*26 + int(r-'a'+1)
		} else {
			break
		}
	}
	return n - 1
}

func WriteImportTemplate(w io.Writer) error {
	if _, err := w.Write([]byte{0xEF, 0xBB, 0xBF}); err != nil {
		return err
	}
	cw := csv.NewWriter(w)
	rows := [][]string{
		{"Tipe soal", "Pertanyaan", "Bobot", "Mata pelajaran", "Topik", "Kelas", "Kesulitan", "Tag", "Pilihan jawaban", "Nomor kunci pilihan", "Pernyataan", "Kunci pernyataan", "Jawaban diterima", "Kunci bagian isian", "Rubrik esai", "Pasangan menjodohkan", "Item urutan", "Gambar pertanyaan (URL)", "Gambar pilihan (URL)"},
		{"Pilihan ganda", "Ibu kota Indonesia adalah…", "1", "IPS", "Geografi", "Kelas 8A", "Mudah", "latihan, geografi", "Jakarta\nBandung\nSurabaya", "1", "", "", "", "", "", "", "", "", ""},
		{"Pilihan ganda kompleks", "Pilih bilangan prima", "2", "Matematika", "Bilangan prima", "Kelas 8A", "Sedang", "bilangan", "2\n3\n4", "1, 2", "", "", "", "", "", "", "", "", ""},
		{"Benar / Salah", "Tentukan benar atau salah untuk tiap pernyataan", "1", "IPA", "Tumbuhan", "Kelas 8A", "Mudah", "", "", "", "Tumbuhan membuat makanan melalui fotosintesis\nManusia bernapas menggunakan insang", "Benar\nSalah", "", "", "", "", "", "", ""},
		{"Jawaban singkat", "Sebutkan planet tempat manusia tinggal", "1", "IPA", "Tata surya", "Kelas 8A", "Mudah", "", "", "", "", "", "Bumi|planet Bumi", "", "", "", "", "", ""},
		{"Isian", "Air membeku pada suhu ___ derajat Celsius", "1", "IPA", "Wujud benda", "Kelas 8A", "Mudah", "", "", "", "", "", "", "0|nol", "", "", "", "", ""},
		{"Esai", "Jelaskan proses fotosintesis", "5", "IPA", "Tumbuhan", "Kelas 8A", "Sulit", "uraian", "", "", "", "", "", "", "Menjelaskan cahaya, air, karbon dioksida, dan glukosa", "", "", "", ""},
		{"Menjodohkan", "Pasangkan istilah dengan artinya", "2", "IPA", "Tata surya", "Kelas 8A", "Sedang", "", "", "", "", "", "", "", "", "Matahari -> Bintang pusat tata surya\nBumi -> Planet tempat tinggal manusia", "", "", ""},
		{"Mengurutkan", "Urutkan tahapan daur air", "2", "IPA", "Daur air", "Kelas 8A", "Sedang", "", "", "", "", "", "", "", "", "", "Penguapan\nKondensasi\nPresipitasi", "", ""},
	}
	for _, row := range rows {
		// Class is accepted from older import files but is no longer a bank-question category.
		if len(row) > 5 {
			row = append(row[:5], row[6:]...)
		}
		if err := cw.Write(row); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}
